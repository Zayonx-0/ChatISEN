import argon2 from 'argon2';

export const hashPassword=(value:string)=>argon2.hash(value,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
export const verifyPassword=(hash:string,value:string)=>argon2.verify(hash,value);
