import type {PostgresRepository} from '../../repositories/postgres.js';
import type {PushConfig} from './push-port.js';

const lifetime={message:120,call:45} as const;
const maxAttempts=3;
type Delivery={event_id:string;subscription_id:string;attempts:number};

/**
 * Lit la file d'envoi. Les deux réplicas se partagent le travail : « for update skip locked »
 * et un bail évitent qu'une même livraison soit envoyée deux fois en parallèle.
 */
export class PushDispatcher{
  private running=false;private again=false;
  constructor(private repo:PostgresRepository,private push:PushConfig,private log:(message:string,error?:unknown)=>void){}

  async run(){
    if(this.running){this.again=true;return;}
    this.running=true;
    try{do{this.again=false;await this.expand();while(await this.deliverBatch());}while(this.again);}
    finally{this.running=false;}
  }

  /** Transforme chaque événement en une livraison par abonnement autorisé à cet instant. */
  private async expand(){
    await this.repo.transaction(async client=>{
      const events=await client.query<{event_id:string;conversation_id:string;sender_id:string}>('select event_id,conversation_id,sender_id from push_outbox where expanded_at is null order by created_at limit 50 for update skip locked');
      for(const event of events.rows){
        await client.query(`insert into push_deliveries(event_id,subscription_id)
          select $1,s.id from push_subscriptions s
          join conversation_members m on m.user_id=s.user_id and m.conversation_id=$2 and m.left_at is null
          join sessions se on se.id=s.session_id and se.user_id=s.user_id and se.revoked_at is null and se.expires_at>now()
          where s.user_id<>$3 on conflict do nothing`,[event.event_id,event.conversation_id,event.sender_id]);
        await client.query('update push_outbox set expanded_at=now() where event_id=$1',[event.event_id]);
      }
    });
  }

  private async deliverBatch(){
    const claimed=await this.repo.pool.query<Delivery>(`update push_deliveries d set attempts=d.attempts+1,lease_until=now()+interval '30 seconds'
      where (d.event_id,d.subscription_id) in (
        select event_id,subscription_id from push_deliveries where state='pending' and available_at<=now() and (lease_until is null or lease_until<now())
        order by available_at limit 20 for update skip locked)
      returning d.event_id,d.subscription_id,d.attempts`);
    await Promise.all(claimed.rows.map(delivery=>this.deliver(delivery).catch(error=>this.log('Push delivery failed',error))));
    return claimed.rows.length===20;
  }

  private async deliver({event_id,subscription_id,attempts}:Delivery){
    const set=(state:string,delaySeconds=0)=>this.repo.pool.query('update push_deliveries set state=$3,lease_until=null,available_at=now()+make_interval(secs=>$4) where event_id=$1 and subscription_id=$2',[event_id,subscription_id,state,delaySeconds]);
    // Droits revérifiés juste avant l'envoi : membre actif et session toujours valide.
    const row=(await this.repo.pool.query(`select o.kind,o.conversation_id,o.created_at,s.endpoint,s.p256dh,s.auth,u.display_name,c.mode,c.state as call_state
      from push_outbox o join push_subscriptions s on s.id=$2
      join conversation_members m on m.user_id=s.user_id and m.conversation_id=o.conversation_id and m.left_at is null
      join sessions se on se.id=s.session_id and se.revoked_at is null and se.expires_at>now()
      join users u on u.id=o.sender_id left join calls c on c.id=o.event_id
      where o.event_id=$1`,[event_id,subscription_id])).rows[0];
    if(!row){await set('failed');return;}
    const kind=row.kind as keyof typeof lifetime;
    const remaining=Math.floor(lifetime[kind]-(Date.now()-new Date(row.created_at).getTime())/1000);
    if(remaining<=0||(kind==='call'&&row.call_state!=='ringing')){await set('expired');return;}
    const payload=kind==='call'
      ?{type:'call',conversationId:row.conversation_id,callId:event_id,mode:row.mode,senderName:row.display_name}
      :{type:'message',conversationId:row.conversation_id,messageId:event_id,senderName:row.display_name};
    try{
      await this.push.send({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify(payload),remaining);
      await set('sent');
    }catch(error){
      const status=(error as {statusCode?:number}).statusCode;
      if(status===404||status===410){await this.repo.pool.query('delete from push_subscriptions where id=$1',[subscription_id]);return;}
      this.log(`Push provider refused a delivery (status ${status??'none'})`);
      await set(attempts>=maxAttempts?'failed':'pending',attempts*5);
    }
  }

  async cleanup(){
    await this.repo.pool.query("delete from push_outbox where created_at<now()-interval '1 day'");
  }
}
