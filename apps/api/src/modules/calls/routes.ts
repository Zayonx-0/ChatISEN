import type {FastifyInstance,FastifyReply} from 'fastify';
import type {PostgresRepository} from '../../repositories/postgres.js';
import {invalid,type AuthRequest} from '../../identity/postgres-routes.js';
import {guards,uuid} from '../../kernel/guards.js';
import {CallService,callDto,type CallError} from './service.js';
import {iceServers} from './ice.js';

const failures:Record<CallError,[number,string,string]>={
  not_found:[404,'NOT_FOUND','Appel indisponible'],
  forbidden:[403,'FORBIDDEN','Action refusée'],
  conflict:[409,'CALL_CONFLICT','Appel incompatible avec la demande'],
  idempotency:[409,'IDEMPOTENCY_CONFLICT','Clé déjà utilisée'],
  conference_unavailable:[409,'CONFERENCE_UNAVAILABLE','Les conférences de groupe ne sont pas activées'],
};
const fail=(reply:FastifyReply,error:CallError)=>invalid(reply,...failures[error]);
const only=(body:unknown,keys:string[])=>Boolean(body)&&typeof body==='object'&&Object.keys(body as object).every(k=>keys.includes(k));

export async function registerCalls(app:FastifyInstance,repo:PostgresRepository,calls:CallService,options:{conferences:()=>boolean}){
  const {authenticate,mutation}=guards(repo);
  // Limite par session et par appel, propre à chaque réplica : un établissement normal envoie quelques dizaines de signaux.
  const budget=new Map<string,{count:number;reset:number}>();
  const withinBudget=(key:string)=>{const now=Date.now();let slot=budget.get(key);if(!slot||slot.reset<now){slot={count:0,reset:now+60_000};budget.set(key,slot);if(budget.size>5000)for(const [k,v] of budget)if(v.reset<now)budget.delete(k);}return ++slot.count<=300;};
  const timer=setInterval(()=>{calls.sweep().catch(error=>app.log.error({err:error},'Call sweep failed'));},5000);timer.unref();
  app.addHook('onClose',async()=>clearInterval(timer));

  app.post('/api/v1/conversations/:id/calls',{preHandler:mutation},async(req,reply)=>{
    const cid=(req.params as {id:string}).id,identity=(req as AuthRequest).identity!;
    const body=req.body as {clientId?:unknown;mode?:unknown}|undefined;
    if(!uuid.test(cid))return fail(reply,'not_found');
    if(!only(body,['clientId','mode'])||typeof body!.clientId!=='string'||!uuid.test(body!.clientId)||(body!.mode!=='audio'&&body!.mode!=='video'))return invalid(reply,400,'VALIDATION_ERROR','Appel invalide');
    const result=await calls.start(cid,identity.user.id,identity.session.id,body!.clientId,body!.mode,options.conferences());
    if('error' in result)return fail(reply,result.error);
    return reply.code(result.created?201:200).send(callDto(result.call));
  });

  app.get('/api/v1/calls',{preHandler:authenticate},async(req)=>{
    const identity=(req as AuthRequest).identity!;
    return {items:(await calls.open(identity.user.id)).map(callDto)};
  });

  app.patch('/api/v1/calls/:id',{preHandler:mutation},async(req,reply)=>{
    const id=(req.params as {id:string}).id,body=req.body as {state?:unknown}|undefined;
    if(!uuid.test(id))return fail(reply,'not_found');
    if(!only(body,['state'])||body!.state!=='ended')return invalid(reply,400,'VALIDATION_ERROR','Seul l’état « ended » est accepté');
    const result=await calls.end(id,(req as AuthRequest).identity!.user.id);
    return 'error' in result?fail(reply,result.error):callDto(result.call);
  });

  app.put('/api/v1/calls/:id/participants/me',{preHandler:mutation},async(req,reply)=>{
    const id=(req.params as {id:string}).id,identity=(req as AuthRequest).identity!,body=req.body as {state?:unknown}|undefined;
    if(!uuid.test(id))return fail(reply,'not_found');
    if(!only(body,['state'])||!['joined','declined','left'].includes(body!.state as string))return invalid(reply,400,'VALIDATION_ERROR','État invalide');
    const result=await calls.respond(id,identity.user.id,identity.session.id,body!.state as 'joined'|'declined'|'left');
    return 'error' in result?fail(reply,result.error):callDto(result.call);
  });

  app.post('/api/v1/calls/:id/signals',{preHandler:mutation,bodyLimit:40_000},async(req,reply)=>{
    const id=(req.params as {id:string}).id,identity=(req as AuthRequest).identity!,body=req.body as {type?:unknown;data?:unknown}|undefined;
    if(!uuid.test(id))return fail(reply,'not_found');
    if(!only(body,['type','data'])||!['offer','answer','ice'].includes(body!.type as string)||!body!.data||typeof body!.data!=='object'||Array.isArray(body!.data)||JSON.stringify(body!.data).length>30_000)return invalid(reply,400,'VALIDATION_ERROR','Signal invalide');
    if(!withinBudget(`${identity.session.id}:${id}`))return invalid(reply,429,'RATE_LIMITED','Trop de signaux');
    const result=await calls.signal(id,identity.user.id,identity.session.id,body!.type as 'offer'|'answer'|'ice',body!.data as object);
    return 'error' in result?fail(reply,result.error):reply.code(202).send({accepted:true});
  });

  app.get('/api/v1/ice-servers',{preHandler:authenticate},async(req,reply)=>{
    const identity=(req as AuthRequest).identity!;
    reply.header('Cache-Control','no-store');
    return iceServers(identity.user.id,new Date(identity.session.expiresAt));
  });
}
