import webpush from 'web-push';

export type Subscription={endpoint:string;keys:{p256dh:string;auth:string}};
export type PushSender=(subscription:Subscription,payload:string,ttlSeconds:number)=>Promise<void>;
export type PushConfig={publicKey:string;send:PushSender};

/** Seuls les services Push des navigateurs sont joignables : pas d'appel vers une adresse choisie par un client. */
const exactHosts=new Set(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com']);
export function validSubscription(value:unknown):value is Subscription{
  try{
    const subscription=value as Subscription;
    if(!subscription||typeof subscription.endpoint!=='string'||subscription.endpoint.length>2048)return false;
    const url=new URL(subscription.endpoint);
    const trusted=exactHosts.has(url.hostname)||url.hostname.endsWith('.push.apple.com')||url.hostname.endsWith('.notify.windows.com');
    if(url.protocol!=='https:'||url.username||url.password||url.port||!trusted)return false;
    const {p256dh,auth}=subscription.keys??{};
    if(typeof p256dh!=='string'||typeof auth!=='string'||!/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh)||!/^[A-Za-z0-9_-]+={0,2}$/.test(auth))return false;
    const key=Buffer.from(p256dh,'base64url');
    return key.length===65&&key[0]===4&&Buffer.from(auth,'base64url').length===16;
  }catch{return false;}
}

/** Adaptateur Web Push (VAPID, contenu chiffré). Absent tant que les clés ne sont pas configurées. */
export function webPushFromEnv(env:NodeJS.ProcessEnv=process.env):PushConfig|undefined{
  const publicKey=env.VAPID_PUBLIC_KEY,privateKey=env.VAPID_PRIVATE_KEY,subject=env.VAPID_SUBJECT;
  if(!publicKey||!privateKey||!subject)return undefined;
  const vapidDetails={subject,publicKey,privateKey};
  webpush.setVapidDetails(subject,publicKey,privateKey);
  return {publicKey,send:async(subscription,payload,ttlSeconds)=>{await webpush.sendNotification(subscription,payload,{TTL:ttlSeconds,timeout:10_000,vapidDetails,urgency:ttlSeconds<=60?'high':'normal'});}};
}
