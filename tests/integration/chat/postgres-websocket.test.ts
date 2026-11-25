import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {createRequire} from 'node:module';
const apiRequire=createRequire(new URL('../../../apps/api/package.json',import.meta.url));
const WebSocket=apiRequire('ws') as typeof import('ws');
import {applyMigrations} from '../../../db/migrate.mjs';

const databaseUrl=process.env.DATABASE_URL;
async function until(condition:()=>boolean,label:string){const end=Date.now()+5000;while(Date.now()<end){if(condition())return;await delay(20);}assert.fail(`timeout: ${label}`);}
test('F05 S01 S02 v1 WebSocket wakes on PostgreSQL events, catches up and revalidates session',async t=>{
  if(!databaseUrl)return t.skip('DATABASE_URL not set');
  process.env.CORS_ORIGIN='https://chatisen.test';process.env.CSRF_SECRET='integration-only';
  const pool=new Pool({connectionString:databaseUrl});const client=await pool.connect();try{await applyMigrations(client);}finally{client.release();await pool.end();}
  const {default:app}=await import('../../../apps/api/src/server.js');await app.listen({host:'127.0.0.1',port:0});
  const origin='https://chatisen.test';const suffix=randomBytes(5).toString('hex');
  const register=async(prefix:string)=>{const r=await app.inject({method:'POST',url:'/api/v1/auth/register',headers:{origin},payload:{handle:`${prefix}_${suffix}`,displayName:prefix,password:'secure-password-2026'}});assert.equal(r.statusCode,201,r.body);return {user:r.json().user,cookie:String(r.headers['set-cookie']).split(';')[0]};};
  const sockets:Array<{terminate:()=>void}>=[];
  try{
    const alice=await register('alice'),bob=await register('bob'),eve=await register('eve');
    const address=app.server.address();assert.ok(address&&typeof address!=='string');
    const deniedUpgrade=async(headers:Record<string,string>)=>await new Promise<number>((resolve,reject)=>{
      const ws=new WebSocket(`ws://127.0.0.1:${address.port}/api/v1/ws`,{headers});
      ws.once('unexpected-response',(_request,response)=>{response.resume();resolve(response.statusCode||0);});
      ws.once('open',()=>{ws.terminate();reject(Error('unexpected socket admission'));});
      ws.once('error',()=>{});
    });
    assert.equal(await deniedUpgrade({origin}),401);
    assert.equal(await deniedUpgrade({origin:'https://evil.test',cookie:alice.cookie}),403);

    const headers=(u:typeof alice)=>({origin,cookie:u.cookie,'x-csrf-token':u.user.csrfToken});
    const direct=await app.inject({method:'POST',url:'/api/v1/conversations/direct',headers:headers(alice),payload:{peerId:bob.user.id}});assert.equal(direct.statusCode,201);const cid=direct.json().id;
    const connect=async(u:typeof alice)=>{const messages:any[]=[];const socket=await app.injectWS('/api/v1/ws',{headers:headers(u)},{onInit(ws){ws.on('message',data=>{try{messages.push(JSON.parse(String(data)));}catch{}})}});sockets.push(socket);return {socket,messages};};
    const b=await connect(bob), outsider=await connect(eve);
    b.socket.send(JSON.stringify({v:1,type:'subscribe',conversationId:cid,afterSeq:'0'}));outsider.socket.send(JSON.stringify({v:1,type:'subscribe',conversationId:cid,afterSeq:'0'}));
    await until(()=>b.messages.some(m=>m.type==='subscribed'),'member subscribed');await until(()=>outsider.messages.some(m=>m.type==='error'),'outsider refused');
    const post=async(text:string)=>{const r=await app.inject({method:'POST',url:`/api/v1/conversations/${cid}/messages`,headers:headers(alice),payload:{clientId:randomUUID(),text}});assert.equal(r.statusCode,201,r.body);};
    await post('live');await until(()=>b.messages.some(m=>m.type==='event'&&m.seq==='1'),'live notification');assert.equal(outsider.messages.filter(m=>m.type==='event').length,0);
    b.socket.terminate();await Promise.all(Array.from({length:20},(_,i)=>post(`missed ${i}`)));
    const reconnected=await connect(bob);reconnected.socket.send(JSON.stringify({v:1,type:'subscribe',conversationId:cid,afterSeq:'1'}));
    await until(()=>reconnected.messages.filter(m=>m.type==='event').length===20,'replayed events');
    assert.deepEqual(reconnected.messages.filter(m=>m.type==='event').map(m=>m.seq),Array.from({length:20},(_,i)=>String(i+2)));
    const logout=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:headers(bob)});assert.equal(logout.statusCode,204);
    await post('after logout');await delay(250);assert.equal(reconnected.messages.filter(m=>m.type==='event').length,20);
  }finally{for(const socket of sockets)socket.terminate();await app.close();}
});
