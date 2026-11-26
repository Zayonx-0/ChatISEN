export type Subscription={endpoint:string;keys:{p256dh:string;auth:string}};
export type PushSender=(subscription:Subscription,payload:string,ttlSeconds:number)=>Promise<void>;
/** Port sortant vers les services Push des navigateurs. */
export type PushConfig={publicKey:string;send:PushSender};

export interface PushSubscriptions{
  /** Une session fermée perd ses abonnements. */
  forgetSession(sessionId:string):Promise<void>;
}
