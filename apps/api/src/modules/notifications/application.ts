import type {Database} from '../../platform/db.js';
import {Failure,invalid,notFound} from '../../platform/errors.js';
import type {SessionVerifier} from '../../platform/http.js';
import {observePush} from '../../platform/metrics.js';
import {consumeOutbox} from '../../platform/realtime.js';
import type {AccessPolicy} from '../groups/index.js';
import type {UserDirectory} from '../identity/index.js';
import * as store from './adapters/out/store.js';
import {lifetimeSeconds,maxAttempts,validSubscription,type Kind} from './domain.js';
import type {PushConfig,PushSubscriptions} from './ports.js';

const consumed=['message.created','call.invitation','call.closed'];

export class NotificationService implements PushSubscriptions{
  private running=false;private again=false;
  constructor(private db:Database,private access:AccessPolicy,private sessions:SessionVerifier,private users:UserDirectory,
    private push:PushConfig|undefined,private log:(message:string,error?:unknown)=>void){}

  get configuration(){return {available:Boolean(this.push),publicKey:this.push?.publicKey??null};}
  async subscribe(userId:string,sessionId:string,input:unknown){
    if(!this.push)throw new Failure('unavailable','Notifications non configurées');
    if(!validSubscription(input))throw invalid('Abonnement invalide');
    return {id:await store.upsert(this.db.pool,userId,sessionId,input)};
  }
  async unsubscribe(id:string,userId:string){if(!await store.removeOwn(this.db.pool,id,userId))throw notFound('Abonnement inconnu');}
  forgetSession(sessionId:string){return store.removeSession(this.db.pool,sessionId);}

  /** Lit l'outbox puis envoie. Les deux réplicas se partagent le travail. */
  async run(){
    if(this.running){this.again=true;return;}
    this.running=true;
    try{do{this.again=false;await this.expand();while(await this.deliverBatch());}while(this.again);}
    finally{this.running=false;}
  }

  /** Transforme chaque événement en une livraison par abonnement autorisé à cet instant. */
  private async expand(){
    let expired=0;
    await this.db.transaction(tx=>consumeOutbox(tx,consumed,async event=>{
      if(event.type==='call.closed'){expired+=await store.expireCall(tx,event.entityId);return;}
      const recipients=(await this.access.memberIds(event.conversationId,tx)).filter(id=>id!==event.actorId);
      const subscriptions=await store.ofUsers(tx,recipients);
      const active=await this.sessions.activeSessionIds(subscriptions.map(s=>s.session_id));
      await store.plan(tx,{eventId:event.id,kind:event.type==='call.invitation'?'call':'message',conversationId:event.conversationId,senderId:event.actorId,entityId:event.entityId,
        callMode:typeof event.payload.mode==='string'?event.payload.mode:null,eventAt:event.createdAt},subscriptions.filter(s=>active.has(s.session_id)).map(s=>s.id));
    }));
    if(expired)observePush('expired',expired);
  }

  private async deliverBatch(){
    if(!this.push)return false;
    const claimed=await store.claim(this.db.pool,20);
    await Promise.all(claimed.map(delivery=>this.deliver(delivery).catch(error=>{observePush('failed');this.log('Push delivery failed',error);})));
    return claimed.length===20;
  }

  private async deliver(delivery:store.Delivery){
    const target=await store.subscription(this.db.pool,delivery.subscription_id);
    if(!target)return;
    // Droits revérifiés juste avant l'envoi : membre actif et session toujours valide.
    const allowed=await this.access.membership(delivery.conversation_id,target.user_id)&&(await this.sessions.activeSessionIds([target.session_id])).has(target.session_id);
    if(!allowed){if(await store.settle(this.db.pool,delivery,'failed'))observePush('failed');return;}
    const kind:Kind=delivery.kind;
    const remaining=Math.floor(lifetimeSeconds[kind]-(Date.now()-delivery.event_at.getTime())/1000);
    if(remaining<=0){if(await store.settle(this.db.pool,delivery,'expired'))observePush('expired');return;}
    if(!await store.stillPending(this.db.pool,delivery))return;
    const sender=(await this.users.findMany([delivery.sender_id])).get(delivery.sender_id);
    const common={conversationId:delivery.conversation_id,senderName:sender?.displayName??'ChatISEN'};
    const payload=kind==='call'?{type:'call',...common,callId:delivery.entity_id,mode:delivery.call_mode}:{type:'message',...common,messageId:delivery.entity_id};
    try{
      if(delivery.attempts>1)observePush('retry');
      await this.push!.send({endpoint:target.endpoint,keys:{p256dh:target.p256dh,auth:target.auth}},JSON.stringify(payload),remaining);
    }catch(error){
      observePush('failed');
      const status=(error as {statusCode?:number}).statusCode;
      if(status===404||status===410)return store.remove(this.db.pool,delivery.subscription_id);
      this.log(`Push provider refused a delivery (status ${status??'none'})`);
      await store.settle(this.db.pool,delivery,delivery.attempts>=maxAttempts?'failed':'pending',delivery.attempts*5);
      return;
    }
    await store.settle(this.db.pool,delivery,'sent');
  }

  cleanup(){return store.prune(this.db.pool);}
}
