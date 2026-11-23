import argon2 from 'argon2';
import {createHmac,timingSafeEqual} from 'node:crypto';
export async function passwordHash(password:string){return argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});}
export async function passwordVerify(hash:string,password:string){return argon2.verify(hash,password);}
export function csrfFor(raw:string){return createHmac('sha256',process.env.CSRF_SECRET||'dev-only-change-me').update(raw).digest('base64url');}
export function csrfOk(raw:string,provided:string){const a=Buffer.from(csrfFor(raw));const b=Buffer.from(provided||'');return a.length===b.length&&timingSafeEqual(a,b);}
