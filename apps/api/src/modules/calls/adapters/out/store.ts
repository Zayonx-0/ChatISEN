import {iso,type Queryable,type Tx} from '../../../../platform/db.js';
import {ringingSeconds,type Call,type CallMode,type EndReason,type Topology} from '../../domain.js';

type Row={id:string;conversation_id:string;initiator_id:string;mode:CallMode;topology:Topology;state:Call['state'];room_name:string;created_at:Date;ended_at:Date|null;end_reason:EndReason|null};
const toCall=(row:Row):Call=>({id:row.id,conversationId:row.conversation_id,initiatorId:row.initiator_id,mode:row.mode,topology:row.topology,state:row.state,room:row.room_name,createdAt:iso(row.created_at),
  ...(row.ended_at?{endedAt:iso(row.ended_at)}:{}),...(row.end_reason?{endReason:row.end_reason}:{})});
const one=(rows:Row[])=>rows[0]?toCall(rows[0]):undefined;

export async function byClientId(db:Queryable,conversationId:string,initiatorId:string,clientId:string){
  return one((await db.query<Row>('select * from calls.calls where conversation_id=$1 and initiator_id=$2 and client_id=$3',[conversationId,initiatorId,clientId])).rows);
}
export async function conversationOf(db:Queryable,callId:string){return (await db.query<{conversation_id:string}>('select conversation_id from calls.calls where id=$1',[callId])).rows[0]?.conversation_id;}
export async function lock(tx:Tx,callId:string){return one((await tx.query<Row>('select * from calls.calls where id=$1 for update',[callId])).rows);}
export async function insert(tx:Tx,call:{id:string;conversationId:string;initiatorId:string;clientId:string;mode:CallMode;topology:Topology}){
  return one((await tx.query<Row>('insert into calls.calls(id,conversation_id,initiator_id,client_id,mode,topology,room_name) values($1,$2,$3,$4,$5,$6,$7) returning *',
    [call.id,call.conversationId,call.initiatorId,call.clientId,call.mode,call.topology,`chatisen_${call.id}`])).rows)!;
}
export async function unansweredIn(tx:Tx,conversationId:string){
  return (await tx.query<{id:string}>("select id from calls.calls where conversation_id=$1 and state='ringing' and created_at<now()-make_interval(secs=>$2)",[conversationId,ringingSeconds])).rows.map(row=>row.id);
}
export async function openIn(db:Queryable,conversationId:string){
  return (await db.query<Row>("select * from calls.calls where conversation_id=$1 and state<>'ended'",[conversationId])).rows.map(toCall);
}
export async function markActive(tx:Tx,callId:string){return one((await tx.query<Row>("update calls.calls set state='active',active_at=coalesce(active_at,now()) where id=$1 returning *",[callId])).rows)!;}
export async function recordMediaRoute(tx:Tx,callId:string,route:'direct'|'relay'){
  return Boolean((await tx.query(`update calls.calls set first_media_route=$2
    where id=$1 and topology='p2p' and active_at is not null and first_media_route is null`,[callId,route])).rowCount);
}
export async function markEnded(tx:Tx,callId:string,reason:EndReason){
  const call=one((await tx.query<Row>("update calls.calls set state='ended',ended_at=now(),end_reason=$2 where id=$1 and state<>'ended' returning *",[callId,reason])).rows);
  if(call)await tx.query("update calls.participants set state='left',left_at=now() where call_id=$1 and state='joined'",[callId]);
  return call;
}
/** Appels ouverts dont l'utilisateur est un participant qui peut encore répondre. */
export async function openFor(db:Queryable,userId:string){
  return (await db.query<Row>(`select c.* from calls.calls c join calls.participants p on p.call_id=c.id and p.user_id=$1
    where c.state<>'ended' and p.state in ('invited','joined') and (c.state='active' or c.created_at>now()-make_interval(secs=>$2))
    order by c.created_at desc`,[userId,ringingSeconds])).rows.map(toCall);
}
export async function unanswered(db:Queryable){
  return (await db.query<{id:string}>("select id from calls.calls where state='ringing' and created_at<now()-make_interval(secs=>$1)",[ringingSeconds])).rows.map(row=>row.id);
}
export type OpenParticipant={callId:string;userId:string;sessionId:string|null};
export async function openParticipants(db:Queryable,sessionId?:string){
  return (await db.query<OpenParticipant>(`select p.call_id as "callId",p.user_id as "userId",p.session_id as "sessionId"
    from calls.participants p join calls.calls c on c.id=p.call_id
    where c.state<>'ended' and p.state='joined' and ${sessionId?'p.session_id=$1':"(c.state='active' or c.topology='sfu')"}`,sessionId?[sessionId]:[])).rows;
}

export type Participant={userId:string;sessionId:string|null;state:'invited'|'joined'|'declined'|'left'|'removed'};
export async function participant(tx:Tx,callId:string,userId:string):Promise<Participant|undefined>{
  const row=(await tx.query('select user_id,session_id,state from calls.participants where call_id=$1 and user_id=$2 for update',[callId,userId])).rows[0];
  return row?{userId:row.user_id,sessionId:row.session_id,state:row.state}:undefined;
}
export async function joined(tx:Tx,callId:string){
  return (await tx.query('select user_id,session_id from calls.participants where call_id=$1 and state=\'joined\'',[callId])).rows.map(row=>({userId:row.user_id as string,sessionId:row.session_id as string|null}));
}
export async function invite(tx:Tx,callId:string,userId:string){await tx.query("insert into calls.participants(call_id,user_id,state) values($1,$2,'invited') on conflict do nothing",[callId,userId]);}
export async function join(tx:Tx,callId:string,userId:string,sessionId:string){
  await tx.query(`insert into calls.participants(call_id,user_id,session_id,state,joined_at) values($1,$2,$3,'joined',now())
    on conflict(call_id,user_id) do update set session_id=excluded.session_id,state='joined',joined_at=now(),left_at=null`,[callId,userId,sessionId]);
}
export async function setParticipantState(tx:Tx,callId:string,userId:string,state:Participant['state']){await tx.query('update calls.participants set state=$3,left_at=now() where call_id=$1 and user_id=$2',[callId,userId,state]);}
export async function setMediaIdentity(tx:Tx,callId:string,userId:string,identity:string,seconds:number){
  await tx.query('update calls.participants set livekit_identity=$3,admission_expires_at=now()+make_interval(secs=>$4) where call_id=$1 and user_id=$2',[callId,userId,identity,seconds]);
}
export async function participated(db:Queryable,callId:string,userId:string){
  return Boolean((await db.query('select 1 from calls.participants where call_id=$1 and user_id=$2 and joined_at is not null',[callId,userId])).rowCount);
}

export type MediaJob={id:string;kind:'remove_participant'|'close_room';room:string;identity:string|null;attempts:number};
export async function hasPendingEviction(tx:Tx,callId:string,userId:string){
  return Boolean((await tx.query(`select 1 from calls.media_jobs where call_id=$1 and participant_user_id=$2
    and kind='remove_participant' and state='pending' limit 1`,[callId,userId])).rowCount);
}
export async function enqueueMediaJob(tx:Tx,kind:MediaJob['kind'],callId:string,userId:string|null,delaySeconds=0){
  await tx.query('insert into calls.media_jobs(kind,call_id,participant_user_id,run_after) values($1,$2,$3,now()+make_interval(secs=>$4))',[kind,callId,userId,delaySeconds]);
}
export async function claimMediaJob(tx:Tx):Promise<MediaJob|undefined>{
  const row=(await tx.query(`select j.id,j.kind,j.attempts,c.room_name,j.participant_user_id from calls.media_jobs j join calls.calls c on c.id=j.call_id
    where j.state='pending' and j.run_after<=now() order by j.run_after,j.id limit 1 for update of j skip locked`)).rows[0];
  return row?{id:row.id,kind:row.kind,room:row.room_name,identity:row.participant_user_id,attempts:row.attempts}:undefined;
}
export async function finishMediaJob(tx:Tx,id:string,error:string|null,attempts:number){
  if(!error)await tx.query("update calls.media_jobs set state='done',completed_at=now(),attempts=$2 where id=$1",[id,attempts]);
  else await tx.query("update calls.media_jobs set state=(case when $2>=8 then 'failed' else 'pending' end)::calls.media_job_state,attempts=$2,last_error=$3,run_after=now()+make_interval(secs=>$2*5) where id=$1",[id,attempts,error.slice(0,500)]);
}
export async function activeCallCount(db:Queryable){
  const {rows:[row]}=await db.query("select count(*) as total from calls.calls where state='active'");
  return Number(row.total);
}
