import {createHash} from 'node:crypto';
import type {Database,Queryable,Tx} from '../../platform/db.js';
import {conflict,forbidden,invalid,keyReused,notFound} from '../../platform/errors.js';
import {appendEvent,createStream,publishOutbox,publishToUsers,streamStates} from '../../platform/realtime.js';
import type {AuditTrail,UserDirectory} from '../identity/index.js';
import * as store from './adapters/out/store.js';
import {canManage,canRemove,maxMembers,type Role} from './domain.js';
import type {AccessPolicy} from './ports.js';

const unavailable=()=>notFound('Conversation indisponible');

export class GroupService implements AccessPolicy{
  conversationCount(){return store.conversationCount(this.db.pool);}

  constructor(private db:Database,private users:UserDirectory,private audit:AuditTrail,private onError:(error:unknown)=>void){}

  // Port AccessPolicy ---------------------------------------------------------
  async lockMember(tx:Tx,conversationId:string,userId:string){
    const conversation=await store.lockConversation(tx,conversationId);
    if(!conversation)return undefined;
    const member=await store.lockMembership(tx,conversationId,userId);
    return member?{type:conversation.type,role:member.role}:undefined;
  }
  async membership(conversationId:string,userId:string,db:Queryable=this.db.pool){
    const row=await store.visible(db,conversationId,userId);
    return row?{type:row.type,role:row.role}:undefined;
  }
  memberIds(conversationId:string,db:Queryable=this.db.pool){return store.activeMemberIds(db,conversationId);}
  async notifyMembers(db:Queryable,conversationId:string,exceptUserId:string|null,reason:'message'|'conversation',extra:string[]=[]){
    const targets=new Set([...await store.activeMemberIds(db,conversationId),...extra]);
    if(exceptUserId)targets.delete(exceptUserId);
    await publishToUsers(db,[...targets].map(userId=>({userId})),{v:1,type:'conversation_list_changed',conversationId,reason});
  }
  // L'action a réussi : un échec de notification ne doit pas la faire paraître échouée.
  private async changed(conversationId:string,actorId:string,extra:string[]=[]){
    await this.notifyMembers(this.db.pool,conversationId,actorId,'conversation',extra).catch(this.onError);
  }

  // Lecture -------------------------------------------------------------------
  private async summaries(rows:store.ConversationRow[]){
    const states=await streamStates(this.db.pool,rows.map(row=>row.id));
    return rows.map(row=>({id:row.id,type:row.type,title:row.title,lastSeq:states.get(row.id)!.lastSeq,role:row.role,updatedAt:states.get(row.id)!.updatedAt}));
  }
  async list(userId:string,cursor:string|undefined,limit:number){
    const rows=await store.page(this.db.pool,userId,cursor,limit+1),page=rows.slice(0,limit);
    return {items:await this.summaries(page),nextCursor:rows.length>limit?page[page.length-1].id:null};
  }
  async detail(conversationId:string,userId:string){
    const row=await store.visible(this.db.pool,conversationId,userId);
    if(!row)throw unavailable();
    const members=await store.members(this.db.pool,conversationId);
    const profiles=await this.users.findMany(members.map(member=>member.userId));
    return {...(await this.summaries([row]))[0],members:members.map(member=>({user:profiles.get(member.userId)!,role:member.role,joinedAt:member.joinedAt}))};
  }

  // Écriture ------------------------------------------------------------------
  async openDirect(userId:string,peerId:string){
    if(peerId===userId)throw invalid('Destinataire invalide');
    if(!await this.users.find(peerId))throw notFound('Utilisateur indisponible');
    const [low,high]=[userId,peerId].sort();
    const result=await this.db.transaction(async tx=>{
      const conversation=await store.insertDirect(tx,low,high);
      if(conversation.created){
        await createStream(tx,conversation.id);
        for(const id of [low,high])await store.putMember(tx,conversation.id,id,'member');
      }
      return conversation;
    });
    const detail=await this.detail(result.id,userId);
    if(result.created)await this.changed(result.id,userId);
    return {conversation:detail,created:result.created};
  }

  async createGroup(ownerId:string,clientId:string,title:string,memberIds:string[]){
    if(memberIds.includes(ownerId)||new Set(memberIds).size!==memberIds.length)throw invalid('Groupe invalide');
    const found=await this.users.findMany(memberIds);
    if(found.size!==memberIds.length)throw notFound('Utilisateur indisponible');
    const members=[...memberIds].sort();
    const fingerprint=createHash('sha256').update(JSON.stringify({title,members})).digest();
    const result=await this.db.transaction(async tx=>{
      await store.lockCommand(tx,ownerId,clientId);
      const previous=await store.command(tx,ownerId,clientId);
      if(previous){
        if(!previous.command_hash.equals(fingerprint))throw keyReused();
        return {id:previous.conversation_id,created:false};
      }
      const id=await store.insertGroup(tx,title);
      await createStream(tx,id);
      await store.putMember(tx,id,ownerId,'owner');
      for(const member of members)await store.putMember(tx,id,member,'member');
      await appendEvent(tx,id,'conversation.created',id,{title,ownerId});
      await store.saveCommand(tx,ownerId,clientId,fingerprint,id);
      return {id,created:true};
    });
    const detail=await this.detail(result.id,ownerId);
    if(result.created)await this.changed(result.id,ownerId);
    return {conversation:detail,created:result.created};
  }

  /** Verrouille un groupe et rend le rôle de l'acteur. Une conversation privée ne se gère pas. */
  private async lockGroup(tx:Tx,conversationId:string,actorId:string){
    const conversation=await store.lockConversation(tx,conversationId);
    if(!conversation||conversation.type!=='group')throw unavailable();
    const actor=await store.lockMembership(tx,conversationId,actorId);
    if(!actor)throw unavailable();
    return {title:conversation.title,role:actor.role};
  }
  private requireOwner(role:Role){if(!canManage(role))throw forbidden('Action réservée au propriétaire');}

  async rename(conversationId:string,actorId:string,title:string){
    await this.db.transaction(async tx=>{
      const group=await this.lockGroup(tx,conversationId,actorId);
      this.requireOwner(group.role);
      if(group.title===title)return;
      await store.setTitle(tx,conversationId,title);
      await appendEvent(tx,conversationId,'conversation.renamed',conversationId,{title,actorId});
    });
    await this.changed(conversationId,actorId);
    return this.detail(conversationId,actorId);
  }

  /** PUT sur la ressource membre : ajout, changement de rôle ou transfert de propriété. */
  async putMember(conversationId:string,actorId:string,targetId:string,role:Role){
    await this.db.transaction(async tx=>{
      this.requireOwner((await this.lockGroup(tx,conversationId,actorId)).role);
      if(targetId===actorId){if(role!=='owner')throw conflict('Transférez d’abord la propriété');return;}
      const current=await store.lockMembership(tx,conversationId,targetId);
      if(!current){
        if(role==='owner')throw conflict('Le nouveau propriétaire doit déjà être membre');
        if(!await this.users.find(targetId,tx))throw notFound('Utilisateur indisponible');
        if((await store.activeMemberIds(tx,conversationId)).length>=maxMembers)throw conflict('Le groupe est complet');
        await store.putMember(tx,conversationId,targetId,role);
        await appendEvent(tx,conversationId,'conversation.member_added',conversationId,{userId:targetId,actorId});
        if(role==='moderator')await this.roleChanged(tx,conversationId,actorId,targetId,role);
        return;
      }
      if(current.role===role)return;
      if(role==='owner'){
        // L'index unique n'admet qu'un propriétaire actif : l'ancien est rétrogradé d'abord.
        await store.setRole(tx,conversationId,actorId,'member');
        await store.setRole(tx,conversationId,targetId,'owner');
        await appendEvent(tx,conversationId,'conversation.owner_transferred',conversationId,{newOwnerId:targetId,actorId});
        await this.audit.record(tx,{actorId,action:'group.owner_transferred',targetType:'conversation',targetId:conversationId,detail:{userId:targetId}});
        return;
      }
      await store.setRole(tx,conversationId,targetId,role);
      await this.roleChanged(tx,conversationId,actorId,targetId,role);
    });
    await this.changed(conversationId,actorId);
    return this.detail(conversationId,actorId);
  }
  private async roleChanged(tx:Tx,conversationId:string,actorId:string,userId:string,role:Role){
    await appendEvent(tx,conversationId,'conversation.member_role_changed',conversationId,{userId,role,actorId});
    await this.audit.record(tx,{actorId,action:'group.role_changed',targetType:'conversation',targetId:conversationId,detail:{userId,role}});
  }

  /** DELETE sur la ressource membre : retrait, ou départ quand la cible est l'acteur. */
  async deleteMember(conversationId:string,actorId:string,targetId:string){
    await this.db.transaction(async tx=>{
      const {role}=await this.lockGroup(tx,conversationId,actorId);
      if(targetId===actorId){
        const remaining=(await store.activeMemberIds(tx,conversationId)).length;
        if(role==='owner'&&remaining>1)throw conflict('Transférez la propriété avant de quitter le groupe');
        await store.leaveMember(tx,conversationId,actorId);
        const type=role==='owner'?'conversation.closed':'conversation.member_left';
        await appendEvent(tx,conversationId,type,conversationId,{userId:actorId});
        if(role==='owner')await store.close(tx,conversationId);
        await publishOutbox(tx,{type:'conversation.member_gone',conversationId,actorId,entityId:actorId});
        return;
      }
      if(role==='member')throw forbidden('Action réservée au propriétaire et aux modérateurs');
      const target=await store.lockMembership(tx,conversationId,targetId);
      if(!target)throw notFound('Membre indisponible');
      if(!canRemove(role,target.role))throw forbidden('Un modérateur ne retire que les membres simples');
      await store.leaveMember(tx,conversationId,targetId);
      await appendEvent(tx,conversationId,'conversation.member_removed',conversationId,{userId:targetId,actorId});
      await publishOutbox(tx,{type:'conversation.member_gone',conversationId,actorId,entityId:targetId});
      await this.audit.record(tx,{actorId,action:'group.member_removed',targetType:'conversation',targetId:conversationId,detail:{userId:targetId}});
    });
    await this.changed(conversationId,actorId,targetId===actorId?[]:[targetId]);
  }
}
