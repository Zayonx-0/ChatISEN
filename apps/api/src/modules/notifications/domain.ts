import type {Subscription} from './ports.js';

export const lifetimeSeconds={message:120,call:45} as const;
export type Kind=keyof typeof lifetimeSeconds;
export const maxAttempts=3;

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
