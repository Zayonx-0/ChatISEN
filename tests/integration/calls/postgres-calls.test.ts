import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Pool} from 'pg';
import {applyMigrations} from '../../../db/migrate.mjs';

const {WebSocket}=createRequire(new URL('../../../apps/api/package.json',import.meta.url))('ws');

test('calls: one-to-one signalling follows the contract and stays private',async t=>{
  const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)return t.skip('DATABASE_URL not set');
  const origin='https://chatisen.test';
  process.env.CORS_ORIGIN=origin;process.env.CSRF_SECRET='integration-only';process.env.TURN_HOST='turn.example.test';process.env.TURN_SECRET='turn-test-secret';
  const pool=new Pool({connectionString:databaseUrl});const client=await pool.connect();try{await applyMigrations(client);}finally{client.release();}
  const {default:app}=await import('../../../apps/api/src/server.js');
  const {CallService}=await import('../../../apps/api/src/modules/calls/service.js');
  const {PostgresRepository}=await import('../../../apps/api/src/repositories/postgres.js');
  const address=await app.listen({host:'127.0.0.1',port:0});
  const suffix=randomBytes(5).toString('hex');const password='secure-password-2026';
  type Who={cookie:string;id:string;csrf:string;handle:string};
  const session=(r:any,handle:string):Who=>({cookie:String(r.headers['set-cookie']).split(';')[0],id:r.json().user.id,csrf:r.json().user.csrfToken,handle});
  const register=async(prefix:string)=>{const handle=`${prefix}_${suffix}`;const r=await app.inject({method:'POST',url:'/api/v1/auth/register',headers:{origin},payload:{handle,displayName:prefix,password}});assert.equal(r.statusCode,201,r.body);return session(r,handle);};
  const login=async(who:Who)=>{const r=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin},payload:{handle:who.handle,password}});assert.equal(r.statusCode,200,r.body);return session(r,who.handle);};
  const headers=(who:Who)=>({origin,cookie:who.cookie,'x-csrf-token':who.csrf});
  const send=(who:Who,method:'POST'|'PUT'|'PATCH',url:string,payload?:object)=>app.inject({method,url,headers:headers(who),...(payload?{payload}:{})});
  const sockets:any[]=[];
  const listen=async(who:Who)=>{
    const socket=new WebSocket(address.replace('http','ws')+'/api/v1/ws',{headers:{origin,cookie:who.cookie}});sockets.push(socket);
    const frames:any[]=[];socket.on('message',(raw:Buffer)=>frames.push(JSON.parse(String(raw))));
    const until=async(predicate:(f:any)=>boolean,ms=4000)=>{const end=Date.now()+ms;while(Date.now()<end){const hit=frames.find(predicate);if(hit)return hit;await new Promise(r=>setTimeout(r,25));}throw new Error(`frame not received: ${JSON.stringify(frames.map(f=>f.event??f.type))}`);};
    await until(f=>f.type==='ready');await new Promise(r=>setTimeout(r,150));
    return {frames,until};
  };
  const event=(name:string,callId:string,state?:string)=>(f:any)=>f.type==='user_event'&&f.event===name&&f.data.callId===callId&&(!state||f.data.state===state);
  try{
    const alice=await register('alice'),bob=await register('bob'),eve=await register('eve');const bobPhone=await login(bob);
    const direct=(await send(alice,'POST','/api/v1/conversations/direct',{peerId:bob.id})).json();
    const aliceWs=await listen(alice),bobWs=await listen(bob),phoneWs=await listen(bobPhone),eveWs=await listen(eve);
    const url=`/api/v1/conversations/${direct.id}/calls`;const payload={clientId:randomUUID(),mode:'video'};

    assert.equal((await send(eve,'POST',url,payload)).statusCode,404);
    assert.equal((await app.inject({method:'POST',url,headers:{origin,cookie:alice.cookie},payload})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url,headers:{...headers(alice),origin:'https://evil.test'},payload})).statusCode,403);
    const [first,retry]=await Promise.all([send(alice,'POST',url,payload),send(alice,'POST',url,payload)]);
    assert.deepEqual([first.statusCode,retry.statusCode].sort(),[200,201]);assert.equal(first.json().id,retry.json().id);
    const call=first.json();assert.deepEqual(Object.keys(call).sort(),['conversationId','createdAt','id','initiatorId','mode','state','topology']);
    assert.deepEqual([call.state,call.topology],['ringing','p2p']);
    assert.equal((await send(alice,'POST',url,{...payload,mode:'audio'})).statusCode,409);
    assert.equal((await send(bob,'POST',url,{clientId:randomUUID(),mode:'audio'})).statusCode,409);

    await bobWs.until(event('call.invitation',call.id));await phoneWs.until(event('call.invitation',call.id));
    await aliceWs.until(event('call.updated',call.id,'ringing'));
    assert.equal((await app.inject({method:'GET',url:'/api/v1/calls',headers:{cookie:bob.cookie}})).json().items[0].id,call.id);
    assert.deepEqual((await app.inject({method:'GET',url:'/api/v1/calls',headers:{cookie:eve.cookie}})).json().items,[]);

    const signals=`/api/v1/calls/${call.id}/signals`;const mine=`/api/v1/calls/${call.id}/participants/me`;
    assert.equal((await send(alice,'POST',signals,{type:'offer',data:{sdp:'early'}})).statusCode,409);
    assert.equal((await send(eve,'PUT',mine,{state:'joined'})).statusCode,404);
    const joined=await send(bob,'PUT',mine,{state:'joined'});assert.equal(joined.statusCode,200,joined.body);assert.equal(joined.json().state,'active');
    assert.equal((await send(bobPhone,'PUT',mine,{state:'joined'})).statusCode,409,'a second device cannot take the call');
    await aliceWs.until(event('call.updated',call.id,'active'));await phoneWs.until(event('call.updated',call.id,'active'));

    // A real video offer is larger than a PostgreSQL notification payload.
    const sdp='v=0\r\n'+'a=candidate:x\r\n'.repeat(900);assert.ok(sdp.length>9000);
    for(let i=0;i<3;i++)assert.equal((await send(alice,'POST',signals,{type:i?'ice':'offer',data:{sdp,n:i}})).statusCode,202);
    await bobWs.until(f=>event('call.signal',call.id)(f)&&f.data.data.n===2);
    assert.deepEqual(bobWs.frames.filter(event('call.signal',call.id)).map((f:any)=>f.data.data.n),[0,1,2],'signals keep their order');
    assert.equal(bobWs.frames.find(event('call.signal',call.id)).data.from,alice.id);
    await new Promise(r=>setTimeout(r,200));
    assert.equal(phoneWs.frames.filter(event('call.signal',call.id)).length,0,'only the participating session gets signals');
    assert.equal(aliceWs.frames.filter(event('call.signal',call.id)).length,0);
    assert.equal(eveWs.frames.filter((f:any)=>f.type==='user_event').length,0);
    assert.equal((await send(bobPhone,'POST',signals,{type:'answer',data:{}})).statusCode,403);
    assert.equal((await send(eve,'POST',signals,{type:'answer',data:{}})).statusCode,404);
    assert.equal((await send(alice,'POST',signals,{type:'ice',data:{blob:'x'.repeat(31_000)}})).statusCode,400);

    // Closing the participating session ends the call for the other side.
    assert.equal((await send(bob,'POST','/api/v1/auth/logout')).statusCode,204);
    const dropped=await aliceWs.until(event('call.updated',call.id,'ended'));assert.equal(dropped.data.reason,'disconnected');
    assert.equal((await send(alice,'POST',signals,{type:'ice',data:{}})).statusCode,409);

    const declined=(await send(alice,'POST',url,{clientId:randomUUID(),mode:'audio'})).json();
    const no=await send(bobPhone,'PUT',`/api/v1/calls/${declined.id}/participants/me`,{state:'declined'});assert.equal(no.json().state,'ended');
    assert.equal((await aliceWs.until(event('call.updated',declined.id,'ended'))).data.reason,'declined');

    const unanswered=(await send(alice,'POST',url,{clientId:randomUUID(),mode:'audio'})).json();
    await pool.query("update calls set created_at=now()-interval '2 minutes' where id=$1",[unanswered.id]);
    const repo=new PostgresRepository(databaseUrl);try{await new CallService(repo).sweep();}finally{await repo.close();}
    assert.equal((await aliceWs.until(event('call.updated',unanswered.id,'ended'))).data.reason,'expired');

    const hung=(await send(alice,'POST',url,{clientId:randomUUID(),mode:'audio'})).json();
    assert.equal((await send(eve,'PATCH',`/api/v1/calls/${hung.id}`,{state:'ended'})).statusCode,404);
    assert.equal((await send(alice,'PATCH',`/api/v1/calls/${hung.id}`,{state:'ended'})).json().state,'ended');
    assert.equal((await send(bobPhone,'PUT',`/api/v1/calls/${hung.id}/participants/me`,{state:'joined'})).statusCode,409);

    const group=(await send(alice,'POST','/api/v1/conversations/groups',{clientId:randomUUID(),title:'Conf',memberIds:[bobPhone.id,eve.id]})).json();
    const conference=await send(alice,'POST',`/api/v1/conversations/${group.id}/calls`,{clientId:randomUUID(),mode:'video'});
    assert.equal(conference.statusCode,409);assert.equal(conference.json().code,'CONFERENCE_UNAVAILABLE');

    const ice=await app.inject({method:'GET',url:'/api/v1/ice-servers',headers:{cookie:alice.cookie}});assert.equal(ice.statusCode,200);assert.equal(ice.headers['cache-control'],'no-store');
    const [stun,turn]=ice.json().iceServers;assert.deepEqual(stun.urls,['stun:turn.example.test:3478']);
    assert.deepEqual(turn.urls,['turn:turn.example.test:3478?transport=udp','turns:turn.example.test:5349?transport=tcp']);
    assert.ok(turn.username.endsWith(`:${alice.id}`));assert.ok(Number(turn.username.split(':')[0])<=Math.floor(Date.now()/1000)+3600);
    assert.equal(turn.credential,createHmac('sha1','turn-test-secret').update(turn.username).digest('base64'));
    assert.ok(!ice.body.includes('turn-test-secret'));
    assert.equal((await app.inject({method:'GET',url:'/api/v1/ice-servers'})).statusCode,401);
  }finally{for(const socket of sockets)socket.terminate();delete process.env.TURN_HOST;delete process.env.TURN_SECRET;await app.close();await pool.end();}
});
