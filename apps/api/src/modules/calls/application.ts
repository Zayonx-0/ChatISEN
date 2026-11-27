import {randomUUID} from 'node:crypto';
import type {Database,Tx} from '../../platform/db.js';
import {conflict,forbidden,keyReused,notFound} from '../../platform/errors.js';
import type {SessionVerifier} from '../../platform/http.js';
import {consumeOutbox,outboxChannel,publishOutbox,publishToUsers,userEvent,type Target} from '../../platform/realtime.js';
import type {AccessPolicy,Membership} from '../groups/index.js';
import * as store from './adapters/out/store.js';
import {admissionSeconds,callEventData,type Call,type CallMode,type EndReason,type ParticipationState,type SignalType} from './domain.js';
import type {CallRegistry,MediaServer} from './ports.js';

const unavailable=()=>notFound('Appel indisponible');
const busy=()=>conflict('Appel incompatible avec la demande','CALL_CONFLICT');
export const mediaJobsReady='call.media_jobs_ready';

export class CallService implements CallRegistry{
  constructor(private db:Database,private access:AccessPolicy,private sessions:SessionVerifier,private media:MediaServer|undefined){}

  participated(callId:string,userId:string){return store.participated(this.db.pool,callId,userId);}
  recordMediaRoute(tx:Tx,callId:string,route:'direct'|'relay'){return store.recordMediaRoute(tx,callId,route);}

  /** Verrous dans l'ordre commun : conversation, appartenance, puis appel. */
  private async lockCall(tx:Tx,callId:string,userId:string):Promise<{call:Call;member:Membership}>{
    const conversationId=await store.conversationOf(tx,callId);
    const member=conversationId?await this.access.lockMember(tx,conversationId,userId):undefined;
    if(!member)throw unavailable();
    return {call:(await store.lock(tx,callId))!,member};
  }
  private async everyone(tx:Tx,conversationId:string):Promise<Target[]>{return (await this.access.memberIds(conversationId,tx)).map(userId=>({userId}));}
  private async broadcast(tx:Tx,call:Call,event:'call.invitation'|'call.updated',targets?:Target[]){
    await publishToUsers(tx,targets??await this.everyone(tx,call.conversationId),userEvent(event,callEventData(call)));
  }
  /** L'appel ne sonne plus : les notifications encore en attente n'ont plus de sens. */
  private async stoppedRinging(tx:Tx,call:Call,actorId:string){
    await publishOutbox(tx,{type:'call.closed',conversationId:call.conversationId,actorId,entityId:call.id});
  }
  private async finish(tx:Tx,callId:string,reason:EndReason){
    const call=await store.markEnded(tx,callId,reason);
    if(!call)return undefined;
    if(call.topology==='sfu')await store.enqueueMediaJob(tx,'close_room',callId,null);
    await this.broadcast(tx,call,'call.updated');
    await this.stoppedRinging(tx,call,call.initiatorId);
    return call;
  }

  async start(conversationId:string,userId:string,sessionId:string,clientId:string,mode:CallMode){
    return this.db.transaction(async tx=>{
      const member=await this.access.lockMember(tx,conversationId,userId);
      if(!member)throw notFound('Conversation indisponible');
      const previous=await store.byClientId(tx,conversationId,userId,clientId);
      if(previous){if(previous.mode!==mode)throw keyReused();return {call:previous,created:false};}
      const topology=member.type==='direct'?'p2p' as const:'sfu' as const;
      if(topology==='sfu'&&!this.media)throw conflict('Les conférences de groupe ne sont pas activées','CONFERENCE_UNAVAILABLE');
      for(const id of await store.unansweredIn(tx,conversationId))await this.finish(tx,id,'expired');
      const open=(await store.openIn(tx,conversationId))[0];
      // Un membre revient ainsi dans la conférence en cours de son groupe.
      if(open){if(open.topology==='sfu'&&this.media)return {call:open,created:false};throw busy();}
      const call=await store.insert(tx,{id:randomUUID(),conversationId,initiatorId:userId,clientId,mode,topology});
      const others=(await this.access.memberIds(conversationId,tx)).filter(id=>id!==userId);
      await store.join(tx,call.id,userId,sessionId);
      for(const id of others)await store.invite(tx,call.id,id);
      await this.broadcast(tx,call,'call.invitation',others.map(id=>({userId:id})));
      await this.broadcast(tx,call,'call.updated',[{userId}]);
      await publishOutbox(tx,{type:'call.invitation',conversationId,actorId:userId,entityId:call.id,payload:{mode}});
      return {call,created:true};
    });
  }

  async open(userId:string,state?:'ringing'|'active'){
    const calls=await store.openFor(this.db.pool,userId),visible:Call[]=[];
    for(const call of calls)if((!state||call.state===state)&&await this.access.membership(call.conversationId,userId))visible.push(call);
    return visible;
  }

  async respond(callId:string,userId:string,sessionId:string,state:ParticipationState){
    return this.db.transaction(async tx=>{
      const {call}=await this.lockCall(tx,callId,userId);
      const own=await store.participant(tx,callId,userId);
      if(!own&&call.topology==='p2p')throw unavailable();
      if(call.state==='ended'){if(state==='joined')throw busy();return call;}
      if(state==='joined'){
        if(own?.state==='joined'){if(own.sessionId!==sessionId)throw busy();return call;} // déjà pris sur un autre appareil
        // LiveKit réutilise l'identité de l'utilisateur : une éviction en attente toucherait aussi la nouvelle session.
        if(call.topology==='sfu'&&own&&await store.hasPendingEviction(tx,callId,userId))throw busy();
        await store.join(tx,callId,userId,sessionId);
        // Une conférence que seul son initiateur a rejointe sonne encore pour les autres.
        const wasRinging=call.state==='ringing';
        const updated=await store.markActive(tx,callId);
        await this.broadcast(tx,updated,'call.updated');
        if(wasRinging)await this.stoppedRinging(tx,updated,userId);
        return updated;
      }
      // Seule la session qui participe peut quitter ; refuser reste possible depuis toute session invitée.
      if(own?.state==='joined'&&own.sessionId!==sessionId)throw busy();
      if(call.topology==='p2p')return (await this.finish(tx,callId,state==='declined'?'declined':'ended'))!;
      await store.setParticipantState(tx,callId,userId,state);
      if(!(await store.joined(tx,callId)).length)return (await this.finish(tx,callId,'ended'))!;
      await this.broadcast(tx,call,'call.updated');
      return call;
    });
  }

  async end(callId:string,userId:string){
    return this.db.transaction(async tx=>{
      const {call,member}=await this.lockCall(tx,callId,userId);
      const own=await store.participant(tx,callId,userId);
      // L'initiateur, le propriétaire du groupe, ou l'un des deux correspondants d'un appel direct.
      const allowed=call.initiatorId===userId||(member.type==='group'?member.role==='owner':own?.state==='joined');
      if(!allowed)throw forbidden();
      return await this.finish(tx,callId,'ended')??call;
    });
  }

  /** Remet un signal WebRTC à la seule session du correspondant qui participe. */
  async signal(callId:string,userId:string,sessionId:string,type:SignalType,data:object){
    await this.db.transaction(async tx=>{
      const {call}=await this.lockCall(tx,callId,userId);
      if(call.topology!=='p2p'||call.state!=='active')throw busy();
      const participants=await store.joined(tx,callId);
      const own=participants.find(p=>p.userId===userId),peer=participants.find(p=>p.userId!==userId);
      if(!own||own.sessionId!==sessionId)throw forbidden();
      if(!peer?.sessionId)throw busy();
      await publishToUsers(tx,[{userId:peer.userId,sessionId:peer.sessionId}],userEvent('call.signal',{callId,from:userId,type,data}));
    });
  }

  /** Jeton d'entrée dans la salle d'une conférence, pour la session qui a rejoint l'appel. */
  async admit(callId:string,userId:string,sessionId:string){
    const media=this.media;
    return this.db.transaction(async tx=>{
      const {call}=await this.lockCall(tx,callId,userId);
      const own=await store.participant(tx,callId,userId);
      if(!media||call.topology!=='sfu'||call.state==='ended'||own?.state!=='joined'||own.sessionId!==sessionId)throw busy();
      if(await store.hasPendingEviction(tx,callId,userId))throw busy();
      await store.setMediaIdentity(tx,callId,userId,userId,admissionSeconds);
      return media.admit(call.room,userId,admissionSeconds);
    });
  }

  private async removeParticipant(tx:Tx,call:Call,userId:string,reason:EndReason){
    await store.setParticipantState(tx,call.id,userId,'removed');
    if(call.topology==='sfu'){
      // Seconde éviction après l'expiration du dernier jeton délivré.
      await store.enqueueMediaJob(tx,'remove_participant',call.id,userId);
      await store.enqueueMediaJob(tx,'remove_participant',call.id,userId,admissionSeconds+5);
      await tx.query('select pg_notify($1,$2)',[outboxChannel,mediaJobsReady]);
    }
    if(call.topology==='p2p'||!(await store.joined(tx,call.id)).length)await this.finish(tx,call.id,reason);
    else await this.broadcast(tx,call,'call.updated');
  }

  private async removeSessionParticipant({callId,userId,sessionId}:store.OpenParticipant){
    await this.db.transaction(async tx=>{
      const call=await store.lock(tx,callId);
      if(!call||call.state==='ended')return;
      const participant=await store.participant(tx,callId,userId);
      if(participant?.state!=='joined'||participant.sessionId!==sessionId)return;
      if(call.topology==='p2p')await this.finish(tx,callId,'disconnected');
      else await this.removeParticipant(tx,call,userId,'disconnected');
    });
  }

  async endForSession(sessionId:string){
    for(const participant of await store.openParticipants(this.db.pool,sessionId))await this.removeSessionParticipant(participant);
  }

  /** Sonneries sans réponse et appels dont une session a expiré. Sans effet en double entre réplicas. */
  async sweep(){
    for(const id of await store.unanswered(this.db.pool))await this.db.transaction(tx=>this.finish(tx,id,'expired'));
    const carried=await store.openParticipants(this.db.pool);
    const alive=await this.sessions.activeSessionIds(carried.flatMap(row=>row.sessionId?[row.sessionId]:[]));
    for(const participant of carried)
      if(!participant.sessionId||!alive.has(participant.sessionId))await this.removeSessionParticipant(participant);
  }

  /** Un membre retiré ou parti quitte les appels de la conversation, y compris côté SFU. */
  async removeDepartedMembers(){
    await this.db.transaction(tx=>consumeOutbox(tx,['conversation.member_gone'],async event=>{
      for(const {id} of await store.openIn(tx,event.conversationId)){
        const call=await store.lock(tx,id);
        if(!call||call.state==='ended')continue;
        const participant=await store.participant(tx,id,event.entityId);
        if(!participant||participant.state==='removed')continue;
        await this.removeParticipant(tx,call,event.entityId,'ended');
      }
    }));
  }

  /** Exécute les ordres destinés aux SFU, avec reprise tant qu'ils échouent. */
  async runMediaJobs(){
    const media=this.media;
    if(!media)return;
    for(let handled=true;handled;)handled=await this.db.transaction(async tx=>{
      const job=await store.claimMediaJob(tx);
      if(!job)return false;
      const error=await (job.kind==='close_room'?media.closeRoom(job.room):media.removeParticipant(job.room,job.identity!)).then(()=>null,(reason:Error)=>reason.message);
      await store.finishMediaJob(tx,job.id,error,job.attempts+1);
      return true;
    });
  }
}
