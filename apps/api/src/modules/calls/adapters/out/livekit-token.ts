import {createHmac} from 'node:crypto';

const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');

// LiveKit's access token is an HS256 JWT with an explicitly scoped video grant.
// No shared secret, session token or user profile is included in the payload.
export function signAdmission(key:string,secret:string,room:string,identity:string,issuedAt:number,expiresAt:number){
  return sign(secret,{iss:key,sub:identity,nbf:issuedAt,iat:issuedAt,exp:expiresAt,video:{roomJoin:true,room,canPublish:true,canSubscribe:true}});
}

/** Jeton du serveur lui-même, pour l'API d'administration des salles. */
export function signService(key:string,secret:string,grant:Record<string,unknown>,issuedAt:number,expiresAt:number){
  return sign(secret,{iss:key,sub:'chatisen-api',nbf:issuedAt,iat:issuedAt,exp:expiresAt,video:grant});
}

function sign(secret:string,claims:Record<string,unknown>){
  const content=`${encode({alg:'HS256',typ:'JWT'})}.${encode(claims)}`;
  return `${content}.${createHmac('sha256',secret).update(content).digest('base64url')}`;
}
