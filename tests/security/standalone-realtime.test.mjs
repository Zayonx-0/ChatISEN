import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const csrf = x => crypto.createHmac('sha256', 'dev-only-change-me').update(x).digest('base64url');
const maskedFrame = text => { const p=Buffer.from(text), m=crypto.randomBytes(4), h=p.length<126?Buffer.from([0x81,0x80|p.length]):Buffer.from([0x81,0xfe,p.length>>8,p.length&255]); return Buffer.concat([h,m,Buffer.from(p.map((x,i)=>x^m[i%4]))]); };
async function websocket(base, cookie, origin=base) {
  const url=new URL(base); const request=http.request({host:url.hostname,port:url.port,path:'/api/ws',headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':crypto.randomBytes(16).toString('base64'),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})}});
  return new Promise((resolve,reject)=>{request.on('response',res=>{res.resume();resolve({status:res.statusCode})});request.on('error',reject);request.on('upgrade',(res,socket,head)=>{let buffer=Buffer.alloc(0);const messages=[];const parse=data=>{buffer=Buffer.concat([buffer,data]);while(buffer.length>=2){let len=buffer[1]&127,off=2;if(len===126){if(buffer.length<4)return;len=buffer.readUInt16BE(2);off=4}if(buffer.length<off+len)return;const opcode=buffer[0]&15,payload=buffer.subarray(off,off+len);buffer=buffer.subarray(off+len);if(opcode!==1)continue;try{messages.push(JSON.parse(payload.toString()))}catch{}}};socket.on('data',parse);socket.on('error',()=>{});if(head.length)parse(head);resolve({status:res.statusCode,socket,messages,subscribe:cid=>socket.write(maskedFrame(JSON.stringify({subscribe:`conversation:${cid}`})))})});request.end()});
}
async function stream(base,cookie,cid,origin=base){const controller=new AbortController();const response=await fetch(`${base}/api/events?conversationId=${cid}`,{headers:{...(cookie?{cookie}:{}),...(origin?{origin}:{})},signal:controller.signal});const events=[];if(response.ok){const reader=response.body.getReader();(async()=>{let text='';try{for(;;){const {done,value}=await reader.read();if(done)break;text+=new TextDecoder().decode(value);let i;while((i=text.indexOf('\n\n'))>=0){const part=text.slice(0,i);text=text.slice(i+2);if(part.startsWith('data: '))events.push(JSON.parse(part.slice(6)))}}}catch{}})()}return {status:response.status,events,close:()=>controller.abort()}}

test('standalone WS and SSE enforce origin, session and current membership', {timeout:15000}, async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'chatisen-security-'));const dataFile=path.join(dir,'data.json');const tokens={alice:'alice-token',bob:'bob-token',third:'third-token',removed:'removed-token',expired:'expired-token'};const cookies=Object.fromEntries(Object.entries(tokens).map(([name,token])=>[name,`chatisen=${token}`]));const expiry=Date.now()+3500;const now=new Date().toISOString();
  const db={users:Object.keys(tokens).map(name=>({id:name,handle:name,displayName:name,createdAt:now})),sessions:Object.entries(tokens).map(([name,token])=>({id:name,userId:name,tokenHash:sha(token),createdAt:now,expiresAt:new Date(name==='expired'?expiry:Date.now()+60000).toISOString()})),conversations:[{id:'private',type:'group',title:'Private',lastSeq:0}],members:['alice','bob','removed','expired'].map(name=>({conversationId:'private',userId:name,role:name==='alice'?'owner':'member',joinedAt:now})),messages:[],calls:[],attachments:[]};await writeFile(dataFile,JSON.stringify(db));
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));const base=`http://127.0.0.1:${port}`;
  const proc=spawn(process.execPath,['apps/standalone/server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',CHATISEN_DATA_FILE:dataFile}});const resources=[];
  try {await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('server exited')})]);
    assert.equal((await websocket(base,null)).status,401);assert.equal((await websocket(base,cookies.alice,'http://evil.example')).status,403);assert.equal((await websocket(base,cookies.alice,null)).status,403);
    assert.equal((await stream(base,null,'private')).status,401);assert.equal((await stream(base,cookies.third,'private')).status,403);assert.equal((await stream(base,cookies.alice,'private','http://evil.example')).status,403);
    const connections={};for(const name of Object.keys(tokens)){const ws=await websocket(base,cookies[name]);assert.equal(ws.status,101);resources.push(()=>ws.socket.destroy());ws.subscribe('private');connections[name]={ws};if(name!=='third'){const s=await stream(base,cookies[name],'private');assert.equal(s.status,200);resources.push(s.close);connections[name].s=s}}
    await wait(150);
    const post=async text=>{const r=await fetch(`${base}/api/conversations/private/messages`,{method:'POST',headers:{cookie:cookies.alice,'content-type':'application/json','x-csrf-token':csrf(tokens.alice)},body:JSON.stringify({text,clientMessageId:crypto.randomUUID()})});assert.equal(r.status,201)};
    const count=(name,transport)=>connections[name][transport].messages?.filter(e=>e.type==='message.created').length??connections[name][transport].events.filter(e=>e.type==='message.created').length;
    await post('first');await wait(200);for(const name of ['alice','bob','removed','expired']){assert.equal(count(name,'ws'),1,`${name} WS initial`);assert.equal(count(name,'s'),1,`${name} SSE initial`)}assert.equal(count('third','ws'),0);
    let r=await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{cookie:cookies.bob,'x-csrf-token':csrf(tokens.bob)}});assert.equal(r.status,200);
    r=await fetch(`${base}/api/conversations/private/members/removed`,{method:'DELETE',headers:{cookie:cookies.alice,'x-csrf-token':csrf(tokens.alice)}});assert.equal(r.status,200);
    await wait(Math.max(0,expiry-Date.now()+100));await post('second');await wait(250);
    for(const t of ['ws','s']){assert.equal(count('alice',t),2,`active ${t}`);for(const name of ['bob','removed','expired'])assert.equal(count(name,t),1,`${name} ${t}`)}assert.equal(count('third','ws'),0);
    assert.equal((await websocket(base,cookies.bob)).status,401);assert.equal((await stream(base,cookies.removed,'private')).status,403);assert.equal((await stream(base,cookies.expired,'private')).status,401);
  } finally {for(const close of resources)close();proc.kill();await once(proc,'exit').catch(()=>{});await rm(dir,{recursive:true,force:true})}
});
