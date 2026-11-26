import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

export const cookieName='__Host-chatisen';
export const newToken=()=>randomBytes(32).toString('base64url');
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest();

export const csrfFor=(token:string)=>createHmac('sha256',process.env.CSRF_SECRET||'dev-only-change-me').update(token).digest('base64url');
export function csrfOk(token:string,provided:string){
  const expected=Buffer.from(csrfFor(token)),received=Buffer.from(provided||'');
  return expected.length===received.length&&timingSafeEqual(expected,received);
}
