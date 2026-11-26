import {createHmac} from 'node:crypto';

/**
 * Serveurs ICE du projet : STUN et TURN de coturn, avec des identifiants à durée courte
 * (mécanisme « REST API » de coturn : HMAC-SHA1 de « échéance:utilisateur »).
 */
export function iceServers(userId:string,sessionExpiresAt:Date,env:NodeJS.ProcessEnv=process.env,now=Date.now()){
  const nowSeconds=Math.floor(now/1000);
  const expiry=Math.min(nowSeconds+3600,Math.floor(sessionExpiresAt.getTime()/1000));
  const host=env.TURN_HOST,secret=env.TURN_SECRET;
  if(!host||!secret||expiry<=nowSeconds)return {iceServers:[],expiresAt:new Date(Math.max(expiry,nowSeconds)*1000).toISOString()};
  const username=`${expiry}:${userId}`;
  return {
    iceServers:[
      {urls:[`stun:${host}:3478`]},
      {urls:[`turn:${host}:3478?transport=udp`,`turns:${host}:5349?transport=tcp`],username,credential:createHmac('sha1',secret).update(username).digest('base64')},
    ],
    expiresAt:new Date(expiry*1000).toISOString(),
  };
}
