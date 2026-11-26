import type {Pool,PoolClient} from 'pg';

export const userChannel='chatisen_user_events';
export type Target={userId:string;sessionId?:string|null};

/**
 * Dépose une trame dans le topic user:{userId}. Chaque réplica de l'API est réveillé par
 * NOTIFY (émis à la validation de la transaction) et la remet à ses propres sockets.
 */
export async function publishToUsers(db:Pool|PoolClient,targets:Target[],frame:Record<string,unknown>){
  if(!targets.length)return;
  await db.query(`with added as (
      insert into user_events(user_id,session_id,frame)
      select (t->>'userId')::uuid,(t->>'sessionId')::uuid,$2::jsonb from jsonb_array_elements($1::jsonb) t
      returning id,user_id)
    select pg_notify($3,json_build_object('id',id::text,'userId',user_id)::text) from added`,
    [JSON.stringify(targets),JSON.stringify(frame),userChannel]);
}

export const userEvent=(event:string,data:unknown)=>({v:1,type:'user_event',at:new Date().toISOString(),event,data});

/** Prévient les autres membres actifs d'une conversation que leur liste a changé. */
export async function notifyConversationMembers(db:Pool|PoolClient,conversationId:string,exceptUserId:string|null,extra:string[]=[],reason:'message'|'conversation'='conversation'){
  const rows=await db.query<{user_id:string}>('select user_id from conversation_members where conversation_id=$1 and left_at is null',[conversationId]);
  const users=new Set([...rows.rows.map(r=>r.user_id),...extra]);if(exceptUserId)users.delete(exceptUserId);
  await publishToUsers(db,[...users].map(userId=>({userId})),{v:1,type:'conversation_list_changed',conversationId,reason});
}
