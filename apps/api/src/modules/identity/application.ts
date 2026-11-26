import type {Database,Queryable} from '../../platform/db.js';
import {conflict,Failure,forbidden,notFound} from '../../platform/errors.js';
import type {SessionHooks} from '../../platform/hooks.js';
import type {Identity,SessionUser,SessionVerifier} from '../../platform/http.js';
import {newToken,tokenHash} from '../../platform/security.js';
import {hashPassword,verifyPassword} from './adapters/out/passwords.js';
import * as store from './adapters/out/store.js';
import type {GlobalRole} from './domain.js';
import type {AuditEntry,AuditTrail,UserDirectory} from './ports.js';

export const sessionHours=24;
const badCredentials=()=>new Failure('unauthorized','Identifiants invalides');

export class IdentityService implements SessionVerifier,UserDirectory,AuditTrail{
  // Hachage de référence : un identifiant inconnu coûte le même temps qu'un mauvais mot de passe.
  private decoy=hashPassword(newToken());
  constructor(private db:Database,private hooks:SessionHooks){}

  async register(handle:string,name:string,password:string){
    try{
      const user=await store.insertUser(this.db.pool,handle,name,await hashPassword(password));
      return {user,token:await this.openSession(user.id)};
    }catch(error){if((error as {code?:string}).code==='23505')throw conflict('Identifiant indisponible');throw error;}
  }
  async login(handle:string,password:string){
    const found=await store.credentials(this.db.pool,handle);
    const matches=await verifyPassword(found?.passwordHash??await this.decoy,password);
    if(!found||!matches||found.disabled)throw badCredentials();
    return {user:found.user,token:await this.openSession(found.user.id)};
  }
  private async openSession(userId:string){const token=newToken();await store.insertSession(this.db.pool,userId,tokenHash(token),sessionHours);return token;}

  async verify(token:string):Promise<Identity|undefined>{
    const found=await store.sessionByHash(this.db.pool,tokenHash(token));
    return found?{...found,token}:undefined;
  }
  activeSessionIds(ids:string[]){return store.activeSessions(this.db.pool,ids);}
  async logout(sessionId:string){await store.revokeSession(this.db.pool,sessionId);await this.hooks.revoked(sessionId);}

  async find(userId:string,db:Queryable=this.db.pool){
    const found=await store.userById(db,userId);
    return found&&!found.disabled?{id:found.user.id,handle:found.user.handle,displayName:found.user.displayName}:undefined;
  }
  findMany(userIds:string[],db:Queryable=this.db.pool){return store.publicUsers(db,userIds);}
  search(query:string,limit:number){return store.searchUsers(this.db.pool,query,limit);}
  rename(userId:string,name:string){return store.renameUser(this.db.pool,userId,name);}

  record(db:Queryable,entry:AuditEntry){return store.insertAudit(db,entry);}
  async auditTrail(actor:SessionUser,limit:number,beforeId?:string){
    this.requireAdmin(actor);
    return store.auditEntries(this.db.pool,limit,beforeId);
  }
  private requireAdmin(actor:SessionUser){if(actor.globalRole!=='admin')throw forbidden('Réservé à l’administrateur');}

  /** Changer le rôle global ou désactiver un compte. L'administrateur ne lit aucune conversation. */
  async administer(actor:SessionUser,targetId:string,change:{globalRole?:GlobalRole;disabled?:boolean}){
    this.requireAdmin(actor);
    if(actor.id===targetId)throw conflict('Un administrateur ne modifie pas son propre compte');
    const {revoked,user}=await this.db.transaction(async tx=>{
      if(!await store.userById(tx,targetId))throw notFound('Utilisateur indisponible');
      if(change.globalRole!==undefined)await store.setRole(tx,targetId,change.globalRole);
      let revoked:string[]=[];
      if(change.disabled!==undefined){
        await store.setDisabled(tx,targetId,change.disabled);
        if(change.disabled)revoked=await store.revokeUserSessions(tx,targetId);
      }
      await store.insertAudit(tx,{actorId:actor.id,action:'user.administered',targetType:'user',targetId,detail:change});
      return {revoked,user:(await store.userById(tx,targetId))!.user};
    });
    for(const sessionId of revoked)await this.hooks.revoked(sessionId);
    return {id:user.id,handle:user.handle,displayName:user.displayName};
  }
}
