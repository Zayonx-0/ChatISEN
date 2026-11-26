import type {Queryable,Tx} from '../../../../platform/db.js';
import type {Kind} from '../../domain.js';
import type {Subscription} from '../../ports.js';

/** Un navigateur n'a qu'un abonnement : il est rattaché à la session qui le déclare en dernier. */
export async function upsert(db:Queryable,userId:string,sessionId:string,subscription:Subscription){
  return (await db.query<{id:string}>(`insert into notifications.push_subscriptions(user_id,session_id,endpoint,p256dh,auth) values($1,$2,$3,$4,$5)
    on conflict(endpoint) do update set user_id=excluded.user_id,session_id=excluded.session_id,p256dh=excluded.p256dh,auth=excluded.auth,created_at=now() returning id`,
    [userId,sessionId,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth])).rows[0].id;
}
export async function removeOwn(db:Queryable,id:string,userId:string){return Boolean((await db.query('delete from notifications.push_subscriptions where id=$1 and user_id=$2',[id,userId])).rowCount);}
export async function removeSession(db:Queryable,sessionId:string){await db.query('delete from notifications.push_subscriptions where session_id=$1',[sessionId]);}
export async function remove(db:Queryable,id:string){await db.query('delete from notifications.push_subscriptions where id=$1',[id]);}
export async function ofUsers(db:Queryable,userIds:string[]){
  return (await db.query<{id:string;session_id:string}>('select id,session_id from notifications.push_subscriptions where user_id=any($1::uuid[])',[userIds])).rows;
}

export type NewDelivery={eventId:string;kind:Kind;conversationId:string;senderId:string;entityId:string;callMode:string|null;eventAt:Date};
export async function plan(tx:Tx,delivery:NewDelivery,subscriptionIds:string[]){
  await tx.query(`insert into notifications.push_deliveries(event_id,subscription_id,kind,conversation_id,sender_id,entity_id,call_mode,event_at)
    select $1,id,$2,$3,$4,$5,$6,$7 from unnest($8::uuid[]) id on conflict do nothing`,
    [delivery.eventId,delivery.kind,delivery.conversationId,delivery.senderId,delivery.entityId,delivery.callMode,delivery.eventAt,subscriptionIds]);
}
export async function expireCall(tx:Tx,callId:string){
  await tx.query("update notifications.push_deliveries set state='expired' where kind='call' and entity_id=$1 and state='pending'",[callId]);
}

export type Delivery={event_id:string;subscription_id:string;attempts:number;kind:Kind;conversation_id:string;sender_id:string;entity_id:string;call_mode:string|null;event_at:Date};
/** « skip locked » et un bail évitent qu'une même livraison parte deux fois en parallèle. */
export async function claim(db:Queryable,limit:number){
  return (await db.query<Delivery>(`update notifications.push_deliveries d set attempts=d.attempts+1,lease_until=now()+interval '30 seconds'
    where (d.event_id,d.subscription_id) in (
      select event_id,subscription_id from notifications.push_deliveries where state='pending' and available_at<=now() and (lease_until is null or lease_until<now())
      order by available_at limit $1 for update skip locked)
    returning event_id,subscription_id,attempts,kind,conversation_id,sender_id,entity_id,call_mode,event_at`,[limit])).rows;
}
/** N'écrase pas un état décidé entre-temps, par exemple un appel qui ne sonne plus. */
export async function settle(db:Queryable,delivery:Delivery,state:'pending'|'sent'|'failed'|'expired',delaySeconds=0){
  await db.query(`update notifications.push_deliveries set state=$3,lease_until=null,available_at=now()+make_interval(secs=>$4)
    where event_id=$1 and subscription_id=$2 and state='pending'`,[delivery.event_id,delivery.subscription_id,state,delaySeconds]);
}
export async function stillPending(db:Queryable,delivery:Delivery){
  return Boolean((await db.query("select 1 from notifications.push_deliveries where event_id=$1 and subscription_id=$2 and state='pending'",[delivery.event_id,delivery.subscription_id])).rowCount);
}
export async function subscription(db:Queryable,id:string){
  return (await db.query<{user_id:string;session_id:string;endpoint:string;p256dh:string;auth:string}>('select user_id,session_id,endpoint,p256dh,auth from notifications.push_subscriptions where id=$1',[id])).rows[0];
}
export async function prune(db:Queryable){await db.query("delete from notifications.push_deliveries where event_at<now()-interval '1 day'");}
