import {createHmac} from 'node:crypto';

const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');

// LiveKit's access token is an HS256 JWT with an explicitly scoped video grant.
// No shared secret, session token or user profile is included in the payload.
export function signAdmission(key:string,secret:string,room:string,identity:string,issuedAt:number,expiresAt:number){
  const content=`${encode({alg:'HS256',typ:'JWT'})}.${encode({iss:key,sub:identity,nbf:issuedAt,iat:issuedAt,exp:expiresAt,video:{roomJoin:true,room,canPublish:true,canSubscribe:true}})}`;
  return `${content}.${createHmac('sha256',secret).update(content).digest('base64url')}`;
}
