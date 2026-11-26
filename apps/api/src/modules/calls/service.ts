import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {PostgresRepository} from '../../repositories/postgres.js';
import {publishToUsers,userEvent,type Target} from '../../kernel/user-events.js';

export type CallRow={id:string;conversation_id:string;initiator_id:string;client_id:string;mode:'audio'|'video';topology:'p2p'|'sfu';state:'ringing'|'active'|'ended';room_name:string;created_at:Date;ended_at:Date|null;end_reason:string|null};
export type CallError='not_found'|'forbidden'|'conflict'|'idempotency'|'conference_unavailable';
export type EndReason='declined'|'expired'|'ended'|'disconnected';
export const ringingSeconds=45;

export const callDto=(c:CallRow)=>({id:c.id,conversationId:c.conversation_id,initiatorId:c.initiator_id,mode:c.mode,topology:c.topology,state:c.state,createdAt:new Date(c.created_at).toISOString(),...(c.ended_at?{endedAt:new Date(c.ended_at).toISOString()}:{})});
const callState=(c:CallRow)=>({callId:c.id,conversationId:c.conversation_id,initiatorId:c.initiator_id,mode:c.mode,topology:c.topology,state:c.state,...(c.end_reason?{reason:c.end_reason}:{})});

export class CallService{
  constructor(private repo:PostgresRepository){}

  /** Verrou commun avec les mutations de groupe : conversation, puis appartenance. */
  private async lockMember(client:PoolClient,conversationId:string,userId:string){
    const conversation=(await client.query<{type:'direct'|'group'}>('select type from conversations where id=$1 and closed_at is null for update',[conversationId])).rows[0];
    if(!conversation)return undefined;
    const member=(await client.query<{role:string}>('select role from conversation_members where conversation_id=$1 and user_id=$2 and left_at is null for update',[conversationId,userId])).rows[0];
    return member?{type:conversation.type,role:member.role}:undefined;
  }

  private async lockCall(client:PoolClient,callId:string,userId:string){
    const lookup=(await client.query<{conversation_id:string}>('select conversation_id from calls where id=$1',[callId])).rows[0];
    if(!lookup)return undefined;
    const member=await this.lockMember(client,lookup.conversation_id,userId);
    if(!member)return undefined;
    const call=(await client.query<CallRow>('select * from calls where id=$1 for update',[callId])).rows[0];
    return call?{call,member}:undefined;
  }

  private async members(client:PoolClient,conversationId:string):Promise<Target[]>{
    return (await client.query<{user_id:string}>('select user_id from conversation_members where conversation_id=$1 and left_at is null',[conversationId])).rows.map(r=>({userId:r.user_id}));
  }

  private async broadcast(client:PoolClient,call:CallRow,event:'call.invitation'|'call.updated',targets?:Target[]){
    await publishToUsers(client,targets??await this.members(client,call.conversation_id),userEvent(event,callState(call)));
  }

  private async finish(client:PoolClient,callId:string,reason:EndReason){
    const call=(await client.query<CallRow>("update calls set state='ended',ended_at=now(),end_reason=$2 where id=$1 and state<>'ended' returning *",[callId,reason])).rows[0];
    if(!call)return undefined;
    await client.query("update call_participants set state='left',left_at=now() where call_id=$1 and state='joined'",[callId]);
    await this.broadcast(client,call,'call.updated');
    return call;
  }

  async start(conversationId:string,userId:string,sessionId:string,clientId:string,mode:'audio'|'video',conferences:boolean):Promise<{error:CallError}|{call:CallRow;created:boolean}>{
    return this.repo.transaction(async client=>{
      const member=await this.lockMember(client,conversationId,userId);
      if(!member)return {error:'not_found' as const};
      const previous=(await client.query<CallRow>('select * from calls where conversation_id=$1 and initiator_id=$2 and client_id=$3',[conversationId,userId,clientId])).rows[0];
      if(previous)return previous.mode===mode?{call:previous,created:false}:{error:'idempotency' as const};
      const topology=member.type==='direct'?'p2p' as const:'sfu' as const;
      if(topology==='sfu'&&!conferences)return {error:'conference_unavailable' as const};
      const stale=await client.query<{id:string}>(`select id from calls where conversation_id=$1 and state='ringing' and created_at<now()-make_interval(secs=>$2)`,[conversationId,ringingSeconds]);
      for(const row of stale.rows)await this.finish(client,row.id,'expired');
      if((await client.query("select 1 from calls where conversation_id=$1 and state<>'ended'",[conversationId])).rowCount)return {error:'conflict' as const};
      const id=randomUUID();
      const call=(await client.query<CallRow>('insert into calls(id,conversation_id,initiator_id,client_id,mode,topology,room_name) values($1,$2,$3,$4,$5,$6,$7) returning *',[id,conversationId,userId,clientId,mode,topology,`chatisen_${id}`])).rows[0];
      const targets=await this.members(client,conversationId);
      for(const target of targets)await client.query(`insert into call_participants(call_id,user_id,session_id,state,joined_at) values($1,$2,$3,$4,$5)`,
        target.userId===userId?[id,userId,sessionId,'joined',new Date()]:[id,target.userId,null,'invited',null]);
      await this.broadcast(client,call,'call.invitation',targets.filter(t=>t.userId!==userId));
      await this.broadcast(client,call,'call.updated',[{userId}]);
      await client.query("insert into push_outbox(event_id,kind,conversation_id,sender_id) values($1,'call',$2,$3)",[id,conversationId,userId]);
      await client.query("select pg_notify('chatisen_push','')");
      return {call,created:true};
    });
  }

  /** Appels en cours dont l'utilisateur est un participant toujours membre. */
  async open(userId:string){
    return (await this.repo.pool.query<CallRow>(`select c.* from calls c
      join call_participants p on p.call_id=c.id and p.user_id=$1
      join conversation_members m on m.conversation_id=c.conversation_id and m.user_id=$1 and m.left_at is null
      where c.state<>'ended' and p.state in ('invited','joined')
        and (c.state='active' or c.created_at>now()-make_interval(secs=>$2))
      order by c.created_at desc`,[userId,ringingSeconds])).rows;
  }

  async respond(callId:string,userId:string,sessionId:string,state:'joined'|'declined'|'left'):Promise<{error:CallError}|{call:CallRow}>{
    return this.repo.transaction(async client=>{
      const locked=await this.lockCall(client,callId,userId);
      if(!locked)return {error:'not_found' as const};
      const {call}=locked;
      const participant=(await client.query<{state:string;session_id:string|null}>('select state,session_id from call_participants where call_id=$1 and user_id=$2 for update',[callId,userId])).rows[0];
      if(!participant&&call.topology==='p2p')return {error:'not_found' as const};
      if(call.state==='ended')return state==='joined'?{error:'conflict' as const}:{call};
      if(state==='joined'){
        if(participant?.state==='joined'){
          if(participant.session_id===sessionId)return {call};
          return {error:'conflict' as const}; // déjà pris sur un autre appareil
        }
        await client.query(`insert into call_participants(call_id,user_id,session_id,state,joined_at) values($1,$2,$3,'joined',now())
          on conflict(call_id,user_id) do update set session_id=excluded.session_id,state='joined',joined_at=now(),left_at=null`,[callId,userId,sessionId]);
        const updated=(await client.query<CallRow>("update calls set state='active',active_at=coalesce(active_at,now()) where id=$1 returning *",[callId])).rows[0];
        await this.broadcast(client,updated,'call.updated');
        return {call:updated};
      }
      // Seule la session qui participe peut quitter ; refuser reste possible depuis toute session invitée.
      if(participant?.state==='joined'&&participant.session_id!==sessionId)return {error:'conflict' as const};
      if(call.topology==='p2p')return {call:(await this.finish(client,callId,state==='declined'?'declined':'ended'))!};
      await client.query(`update call_participants set state=$3,left_at=now() where call_id=$1 and user_id=$2`,[callId,userId,state]);
      const remaining=await client.query("select 1 from call_participants where call_id=$1 and state='joined'",[callId]);
      if(!remaining.rowCount)return {call:(await this.finish(client,callId,'ended'))!};
      await this.broadcast(client,call,'call.updated');
      return {call};
    });
  }

  async end(callId:string,userId:string):Promise<{error:CallError}|{call:CallRow}>{
    return this.repo.transaction(async client=>{
      const locked=await this.lockCall(client,callId,userId);
      if(!locked)return {error:'not_found' as const};
      const {call,member}=locked;
      const participant=await client.query("select 1 from call_participants where call_id=$1 and user_id=$2 and state='joined'",[callId,userId]);
      // L'initiateur, le propriétaire du groupe, ou l'un des deux correspondants d'un appel direct.
      const allowed=call.initiator_id===userId||(member.type==='group'?member.role==='owner':Boolean(participant.rowCount));
      if(!allowed)return {error:'forbidden' as const};
      return {call:(await this.finish(client,callId,'ended'))??call};
    });
  }

  /** Remet un signal WebRTC à la seule session du correspondant qui participe. */
  async signal(callId:string,userId:string,sessionId:string,type:'offer'|'answer'|'ice',data:object):Promise<{error:CallError}|{ok:true}>{
    return this.repo.transaction(async client=>{
      const locked=await this.lockCall(client,callId,userId);
      if(!locked)return {error:'not_found' as const};
      if(locked.call.topology!=='p2p'||locked.call.state!=='active')return {error:'conflict' as const};
      const participants=(await client.query<{user_id:string;session_id:string|null}>("select user_id,session_id from call_participants where call_id=$1 and state='joined'",[callId])).rows;
      const own=participants.find(p=>p.user_id===userId),peer=participants.find(p=>p.user_id!==userId);
      if(!own||own.session_id!==sessionId)return {error:'forbidden' as const};
      if(!peer?.session_id)return {error:'conflict' as const};
      await publishToUsers(client,[{userId:peer.user_id,sessionId:peer.session_id}],userEvent('call.signal',{callId,from:userId,type,data}));
      return {ok:true as const};
    });
  }

  /** Une session fermée ne peut plus participer : ses appels se terminent. */
  async endForSession(sessionId:string){
    const rows=await this.repo.pool.query<{call_id:string}>("select p.call_id from call_participants p join calls c on c.id=p.call_id where p.session_id=$1 and p.state='joined' and c.state<>'ended' and c.topology='p2p'",[sessionId]);
    for(const row of rows.rows)await this.repo.transaction(client=>this.finish(client,row.call_id,'disconnected'));
  }

  /** Sonneries sans réponse et appels dont une session a expiré. Sans effet en double entre réplicas. */
  async sweep(){
    const rows=await this.repo.pool.query<{id:string;reason:EndReason}>(`
      select id,'expired' as reason from calls where state='ringing' and created_at<now()-make_interval(secs=>$1)
      union
      select c.id,'disconnected' from calls c join call_participants p on p.call_id=c.id and p.state='joined'
        left join sessions s on s.id=p.session_id
        where c.state='active' and c.topology='p2p' and (s.id is null or s.revoked_at is not null or s.expires_at<=now())`,[ringingSeconds]);
    for(const row of rows.rows)await this.repo.transaction(client=>this.finish(client,row.id,row.reason));
  }
}
