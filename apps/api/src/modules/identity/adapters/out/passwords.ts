import argon2 from 'argon2';
import {scrypt,timingSafeEqual} from 'node:crypto';

export const hashPassword=(value:string)=>argon2.hash(value,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});

/** Format des comptes repris de la démo : « scrypt:sel:empreinte ». Le sel est utilisé tel qu'écrit. */
export const isLegacyHash=(hash:string)=>hash.startsWith('scrypt:');

export async function verifyPassword(hash:string,value:string){
  if(!isLegacyHash(hash))return argon2.verify(hash,value);
  const [,salt,expected]=hash.split(':');
  const known=Buffer.from(expected??'','hex');
  if(!salt||known.length!==64)return false;
  const computed=await new Promise<Buffer>((resolve,reject)=>scrypt(value,salt,64,(error,key)=>error?reject(error):resolve(key)));
  return timingSafeEqual(computed,known);
}
