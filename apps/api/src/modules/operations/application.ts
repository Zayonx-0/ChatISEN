import {randomUUID} from 'node:crypto';
import type {Database,Queryable} from '../../platform/db.js';
import {Failure,conflict,invalid} from '../../platform/errors.js';
import type {Identity,SessionUser} from '../../platform/http.js';
import {budget} from '../../platform/validation.js';
import type {AuditTrail,IdentityService} from '../identity/index.js';
import * as store from './adapters/out/store.js';
import {peers,targets,type Inventory,type Target} from './domain.js';
import type {ActivitySources,Certificates,CloudControl,Monitoring,TlsEndpoint} from './ports.js';

export type OperationsOptions={
  inventory?:Inventory;
  monitoring?:Monitoring;
  cloud?:CloudControl;
  certificates?:Certificates;
  grafanaCommand?:string;
  restartsEnabled?:boolean;
};
type AdminIdentity=Pick<IdentityService,'requireAdmin'|'requireAdminSession'|'confirmAdminPassword'>&AuditTrail;

const unavailable=(message:string,code?:string)=>new Failure('unavailable',message,code);
const absent=()=>unavailable('État de santé indisponible','HEALTH_UNKNOWN');

async function available<T>(read:()=>Promise<T>|undefined):Promise<T|null>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const request=read();
    return request?await Promise.race([request,new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),4500);})]):null;
  }catch{return null;}
  finally{clearTimeout(timer);}
}

export class OperationsService{
  private passwordAttempts=budget(10);
  constructor(private db:Database,private identity:AdminIdentity,private activity:ActivitySources,private config:OperationsOptions){}
  get enabled(){return this.config.restartsEnabled===true&&Boolean(this.config.cloud&&this.config.monitoring);}

  async overview(actor:SessionUser){
    this.identity.requireAdmin(actor);
    const {activity,config}=this;
    const [health,alerts,metrics,resources,database,accounts,conversations,dailyMessages,activeCalls,fileBytes,lastBackup,tls,restarts]=await Promise.all([
      available(()=>config.monitoring?.health()),available(()=>config.monitoring?.alerts()),
      available(()=>config.monitoring?.metrics()),available(()=>config.monitoring?.resources()),
      available(()=>activity.database().then(()=>'healthy' as const,()=>'down' as const)),
      available(()=>activity.accounts()),available(()=>activity.conversations()),available(()=>activity.dailyMessages()),
      available(()=>activity.activeCalls()),available(()=>activity.fileBytes()),available(()=>config.cloud?.lastBackup()),
      Promise.all((['load-balancer','coturn'] as const).map(endpoint=>this.certificate(endpoint))),
      this.enabled?available(async()=>{
        const state=await store.read(this.db.pool);
        return {enabled:true,active:state.pending?.target??null,retryAt:state.retryAt&&state.retryAt>state.now?state.retryAt.toISOString():null};
      }):{enabled:false,active:null,retryAt:null},
    ]);
    return {
      servers:targets.map(target=>({
        target,health:health?.[target]?.health??'unknown',
        confirmationName:this.enabled&&health?.[target]?.health!=='unknown'&&health?.[target]?.boot!=null
          ?(config.inventory?.[target]??health?.[target]?.vm)?.name??null:null,
        resources:resources?.[target]??{cpu:[],memory:[],disk:[]},digests:health?.[target]?.digests??null,
      })),
      database:database??'unknown',alerts,metrics:metrics??{},activity:{accounts,conversations,dailyMessages,activeCalls,fileBytes},
      lastBackup,tls,grafanaCommand:config.grafanaCommand??null,restarts,
    };
  }

  private async certificate(endpoint:TlsEndpoint){
    const expiresAt=await available(()=>this.config.certificates?.expiry(endpoint));
    return {endpoint,expiresAt,expiring:expiresAt===null?null:Date.parse(expiresAt)-Date.now()<30*86_400_000};
  }

  async restart(actor:Identity,target:Target,confirmation:string,password:string){
    this.identity.requireAdmin(actor.user);
    const {monitoring,inventory,cloud}=this.config;
    if(!this.enabled||!monitoring||!cloud)throw unavailable('Redémarrage indisponible','RESTART_DISABLED');
    if(!this.passwordAttempts(actor.user.id))throw new Failure('rate_limited','Trop de tentatives de confirmation');
    await this.identity.confirmAdminPassword(actor.user,password);
    const id=randomUUID();
    const preparedAt=performance.now();
    const vm=await this.db.transaction(async tx=>{
      const state=await store.read(tx,true);
      if(state.pending)throw conflict('Un redémarrage est en cours de vérification','RESTART_IN_PROGRESS');
      if(state.retryAt&&state.retryAt>state.now)throw new Failure('rate_limited','Délai entre redémarrages non écoulé','RESTART_COOLDOWN');
      const health=await available(()=>monitoring.health()),sample=health?.[target];
      const vm=inventory?.[target]??sample?.vm;
      if(!vm||!sample||sample.health==='unknown'||sample.boot===null)throw absent();
      if(confirmation!==vm.name)throw invalid('Le nom de confirmation ne correspond pas à la VM');
      const peer=peers[target];
      const other=peer&&(inventory?.[peer]??health?.[peer]?.vm);
      if(peer){
        const status=health?.[peer]?.health;
        if(!other||!status||status==='unknown')throw absent();
        if(status!=='healthy')throw conflict('L’autre VM doit être saine','REDUNDANCY_REQUIRED');
      }
      const [running,peerRunning]=await Promise.all([
        available(()=>cloud.isRunning(vm)),other?available(()=>cloud.isRunning(other)):true,
      ]);
      if(running===null||peerRunning===null)throw absent();
      if(!running)throw conflict('La VM doit être en cours d’exécution','VM_NOT_RUNNING');
      if(!peerRunning)throw conflict('L’autre VM doit être saine','REDUNDANCY_REQUIRED');
      await this.identity.requireAdminSession(tx,actor);
      await store.reserve(tx,id,actor.user.id,target,vm.name,sample.boot);
      await this.audit(tx,actor.user.id,id,target,'server.restart_requested');
      return vm;
    });

    // Après un redémarrage du réplica appelant, l’autre peut terminer l’audit à partir de la base.
    const result=performance.now()-preparedAt<12_000?await cloud.reset(vm,id).catch(()=>'unknown' as const):'rejected';
    if(result==='accepted')return;
    await this.db.transaction(async tx=>{
      const {pending}=await store.read(tx,true);
      if(pending?.id!==id)return;
      if(result==='rejected'){
        await this.audit(tx,actor.user.id,id,target,'server.restart_result','rejected');
        await store.finish(tx);
      }else await this.auditUncertainty(tx,pending);
    });
    throw unavailable(result==='unknown'?'Résultat incertain, vérification en cours':'Redémarrage refusé');
  }

  async reconcile(){
    const {pending,now}=await store.read(this.db.pool);
    if(!pending||now.getTime()-pending.startedAt.getTime()<30_000)return;
    const needsAudit=now.getTime()-pending.startedAt.getTime()>=5*60_000;
    const {monitoring,inventory}=this.config;
    const health=await available(()=>monitoring?.health());
    const sample=health?.[pending.target];
    const rebooted=(inventory?.[pending.target]??sample?.vm)?.name===pending.vmName
      &&sample?.health==='healthy'&&sample.boot!==null&&sample.boot>pending.bootBefore
      &&sample.boot*1000>=pending.startedAt.getTime()-1000;
    if(!rebooted&&(!needsAudit||pending.uncertaintyAudited))return;
    await this.db.transaction(async tx=>{
      const {pending:current}=await store.read(tx,true);
      if(current?.id!==pending.id)return;
      if(rebooted){
        await this.audit(tx,current.actorId,current.id,current.target,'server.restart_result','reboot_observed');
        await store.finish(tx);
      }else await this.auditUncertainty(tx,current);
    });
  }

  private audit(db:Queryable,actorId:string,id:string,target:Target,action:string,result?:string){
    return this.identity.record(db,{actorId,action,targetType:'server',targetId:id,detail:{target,...(result?{result}:{})}});
  }
  private async auditUncertainty(db:Queryable,pending:NonNullable<Awaited<ReturnType<typeof store.read>>['pending']>){
    if(pending.uncertaintyAudited)return;
    await this.audit(db,pending.actorId,pending.id,pending.target,'server.restart_result','unknown');
    await store.markUncertain(db);
  }
}
