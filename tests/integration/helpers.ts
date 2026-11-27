/** Préparation commune : base migrée, application assemblée et réponses validées contre le contrat. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Pool} from 'pg';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {parse} from 'yaml';
import {applyMigrations} from '../../db/migrate.mjs';
import {buildApp,type AppOptions} from '../../apps/api/src/app.js';

export const {WebSocket}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('ws');
export const origin='https://chatisen.test';
export const password='secure-password-2026';
export const contract=parse(readFileSync(new URL('../../docs/architecture/api/openapi.yaml',import.meta.url),'utf8'));

const ajv=new (Ajv as any)({strict:false,allErrors:true});
(addFormats as any)(ajv);
ajv.addSchema({$id:'contract',components:contract.components});
/** Échoue si la valeur ne respecte pas le schéma nommé d'openapi.yaml. */
export function matches(schema:string,value:unknown){
  const validate=ajv.getSchema(`contract#/components/schemas/${schema}`);
  assert.ok(validate,`unknown schema ${schema}`);
  assert.ok(validate(value),`${schema}: ${ajv.errorsText(validate.errors)} in ${JSON.stringify(value).slice(0,400)}`);
}

export type Who={id:string;handle:string;csrf:string;cookie:string};
type Method='GET'|'POST'|'PUT'|'PATCH'|'DELETE';

export async function startApp(options:Partial<AppOptions>={}){
  const databaseUrl=process.env.DATABASE_URL!;
  process.env.CORS_ORIGIN=origin;process.env.CSRF_SECRET='integration-only';
  const pool=new Pool({connectionString:databaseUrl});
  const client=await pool.connect();
  try{await applyMigrations(client);}finally{client.release();}
  const built=await buildApp({databaseUrl,push:undefined,media:undefined,objects:undefined,...options});
  const {app}=built;
  const suffix=randomBytes(5).toString('hex');
  const headers=(who:Who)=>({origin,cookie:who.cookie,'x-csrf-token':who.csrf});
  const call=(who:Who|undefined,method:Method,url:string,payload?:object)=>
    app.inject({method,url:`/api/v1${url}`,headers:who?headers(who):{origin},...(payload===undefined?{}:{payload})});
  const session=(response:{statusCode:number;body:string;headers:Record<string,unknown>;json:()=>any}):Who=>{
    assert.equal(response.statusCode,201,response.body);
    const profile=response.json();matches('UserProfile',profile);
    return {id:profile.id,handle:profile.handle,csrf:profile.csrfToken,cookie:String(response.headers['set-cookie']).split(';')[0]};
  };
  const register=async(prefix:string)=>session(await call(undefined,'POST','/users',{handle:`${prefix}_${suffix}`,displayName:prefix,password}) as any);
  const login=async(who:Who)=>session(await call(undefined,'POST','/sessions',{handle:who.handle,password}) as any);
  const direct=async(a:Who,b:Who)=>{const r=await call(a,'POST','/conversations',{peerId:b.id});assert.ok(r.statusCode===200||r.statusCode===201,r.body);matches('ConversationDetail',r.json());return r.json().id as string;};
  const sockets:{terminate():void}[]=[];
  /** WebSocket réelle : l'application doit écouter. */
  const listen=async(who:Who,address:string,resumeUserEvents=false)=>{
    const socket=new WebSocket(address.replace('http','ws')+'/api/v1/ws'+(resumeUserEvents?'?resumeUserEvents=1':''),{headers:{origin,cookie:who.cookie}});sockets.push(socket);
    const frames:any[]=[];socket.on('message',(raw:Buffer)=>frames.push(JSON.parse(String(raw))));
    const until=async(predicate:(frame:any)=>boolean,ms=5000)=>{
      const end=Date.now()+ms;
      while(Date.now()<end){const hit=frames.find(predicate);if(hit)return hit;await new Promise(r=>setTimeout(r,20));}
      throw new Error(`frame not received: ${JSON.stringify(frames.map(f=>f.event??f.type))}`);
    };
    await until(f=>f.type==='ready');await new Promise(r=>setTimeout(r,150));
    return {socket,frames,until,send:(value:object)=>socket.send(JSON.stringify(value))};
  };
  const close=async()=>{for(const socket of sockets)socket.terminate();await app.close();await pool.end();};
  return {...built,pool,suffix,headers,call,register,login,direct,listen,close};
}
export type Harness=Awaited<ReturnType<typeof startApp>>;
