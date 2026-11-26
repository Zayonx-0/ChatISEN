import webpush from 'web-push';
import type {PushConfig} from '../../ports.js';

/** Adaptateur Web Push (VAPID, contenu chiffré). Absent tant que les clés ne sont pas configurées. */
export function webPushFromEnv(env:NodeJS.ProcessEnv=process.env):PushConfig|undefined{
  const publicKey=env.VAPID_PUBLIC_KEY,privateKey=env.VAPID_PRIVATE_KEY,subject=env.VAPID_SUBJECT;
  if(!publicKey||!privateKey||!subject)return undefined;
  const vapidDetails={subject,publicKey,privateKey};
  webpush.setVapidDetails(subject,publicKey,privateKey);
  return {publicKey,send:async(subscription,payload,ttlSeconds)=>{await webpush.sendNotification(subscription,payload,{TTL:ttlSeconds,timeout:10_000,vapidDetails,urgency:ttlSeconds<=60?'high':'normal'});}};
}
