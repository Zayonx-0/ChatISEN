/** Journal numéroté, outbox et topic personnel : le schéma « realtime » appartient au noyau. */
import {iso,type Queryable,type Tx} from './db.js';

export const eventChannel='chatisen_conversation_events';
export const userChannel='chatisen_user_events';
export const outboxChannel='chatisen_outbox';

export async function createStream(tx:Tx,streamId:string){
  await tx.query('insert into realtime.streams(id) values($1) on conflict do nothing',[streamId]);
}

/** Alloue le numéro suivant et inscrit l'événement dans la même transaction. */
export async function appendEvent(tx:Tx,streamId:string,type:string,entityId:string,payload:Record<string,unknown>){
  const stream=(await tx.query<{last_seq:string}>('update realtime.streams set last_seq=last_seq+1,updated_at=now() where id=$1 returning last_seq',[streamId])).rows[0];
  await tx.query('insert into realtime.events(stream_id,seq,event_type,entity_id,payload) values($1,$2,$3,$4,$5::jsonb)',[streamId,stream.last_seq,type,entityId,JSON.stringify(payload)]);
  return String(stream.last_seq);
}

export type StreamEvent={seq:string;at:string;event:string;data:Record<string,unknown>};
export async function readEvents(db:Queryable,streamId:string,afterSeq:string,limit:number):Promise<StreamEvent[]>{
  const result=await db.query('select seq,event_type,payload,occurred_at from realtime.events where stream_id=$1 and seq>$2 order by seq limit $3',[streamId,afterSeq,limit]);
  return result.rows.map(row=>({seq:String(row.seq),at:iso(row.occurred_at),event:row.event_type,data:row.payload}));
}

export type StreamState={lastSeq:string;updatedAt:string};
export async function streamStates(db:Queryable,streamIds:string[]):Promise<Map<string,StreamState>>{
  const result=await db.query('select id,last_seq,updated_at from realtime.streams where id=any($1::uuid[])',[streamIds]);
  return new Map(result.rows.map(row=>[row.id as string,{lastSeq:String(row.last_seq),updatedAt:iso(row.updated_at)}]));
}

export type Target={userId:string;sessionId?:string|null};
/**
 * Dépose une trame dans le topic user:{userId}. Chaque réplica de l'API est réveillé par
 * NOTIFY (émis à la validation de la transaction) et la remet à ses propres sockets.
 */
export async function publishToUsers(db:Queryable,targets:Target[],frame:Record<string,unknown>){
  if(!targets.length)return;
  await db.query(`with added as (
      insert into realtime.user_events(user_id,session_id,frame,created_at)
      select (t->>'userId')::uuid,(t->>'sessionId')::uuid,$2::jsonb,statement_timestamp() from jsonb_array_elements($1::jsonb) t
      returning id,user_id)
    select pg_notify($3,json_build_object('id',id::text,'userId',user_id)::text) from added`,
    [JSON.stringify(targets),JSON.stringify(frame),userChannel]);
}
export const userEvent=(event:string,data:unknown)=>({v:1,type:'user_event',at:new Date().toISOString(),event,data});

const userEventScope='user_id=$1 and (session_id is null or session_id=$2)';
const userEventWindow="created_at>=now()-interval '5 minutes'";
export async function userEventIds(db:Queryable,userId:string,sessionId:string){
  return (await db.query<{id:string}>(`select id from realtime.user_events where ${userEventScope} and ${userEventWindow}`,[userId,sessionId])).rows.map(row=>row.id);
}
export async function readUserEvents(db:Queryable,userId:string,sessionId:string,filter:string|string[]){
  const byId=typeof filter==='string';
  return (await db.query<{id:string;frame:Record<string,unknown>}>(`select id,frame from realtime.user_events
    where ${userEventScope} and ${byId?'id=$3':`${userEventWindow} and id<>all($3::bigint[]) order by id`}`,[userId,sessionId,filter])).rows;
}
export async function pruneRealtime(db:Queryable){
  await db.query("delete from realtime.user_events where created_at<now()-interval '5 minutes'");
  await db.query("delete from realtime.outbox where created_at<now()-interval '1 day'");
}

export type OutboxEvent={id:string;type:string;conversationId:string;actorId:string;entityId:string;payload:Record<string,unknown>;createdAt:Date};
export async function oldestOutboxAge(db:Queryable){
  return (await db.query<{seconds:number}>(`select greatest(0,extract(epoch from clock_timestamp()-min(created_at)))::float as seconds
    from realtime.outbox where processed_at is null`)).rows[0].seconds;
}
export async function publishOutbox(tx:Tx,event:{type:string;conversationId:string;actorId:string;entityId:string;payload?:Record<string,unknown>}){
  await tx.query('insert into realtime.outbox(event_type,conversation_id,actor_id,entity_id,payload) values($1,$2,$3,$4,$5::jsonb)',
    [event.type,event.conversationId,event.actorId,event.entityId,JSON.stringify(event.payload??{})]);
  await tx.query('select pg_notify($1,$2)',[outboxChannel,event.type]);
}

/**
 * Prend des événements en attente. Chaque type n'a qu'un module consommateur. Le verrou
 * « skip locked » répartit le travail entre réplicas ; la marque est validée avec le traitement.
 */
export async function consumeOutbox(tx:Tx,types:string[],handle:(event:OutboxEvent)=>Promise<void>,limit=50){
  const rows=await tx.query(`select id,event_type,conversation_id,actor_id,entity_id,payload,created_at from realtime.outbox
    where processed_at is null and event_type=any($1::text[]) order by created_at,id limit $2 for update skip locked`,[types,limit]);
  for(const row of rows.rows){
    await handle({id:row.id,type:row.event_type,conversationId:row.conversation_id,actorId:row.actor_id,entityId:row.entity_id,payload:row.payload,createdAt:row.created_at});
    await tx.query('update realtime.outbox set processed_at=now() where id=$1',[row.id]);
  }
  return rows.rows.length;
}
