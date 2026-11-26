import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {matches,origin,startApp,type Who} from '../helpers.js';
import {livekitFromEnv} from '../../../apps/api/src/modules/calls/index.js';

test('calls: one-to-one signalling follows the contract and stays private',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  process.env.TURN_HOST='turn.example.test';process.env.TURN_SECRET='turn-test-secret';
  const h=await startApp();
  const address=await h.app.listen({host:'127.0.0.1',port:0});
  const event=(name:string,callId:string,state?:string)=>(f:any)=>f.type==='user_event'&&f.event===name&&f.data.callId===callId&&(!state||f.data.state===state);
  try{
    const alice=await h.register('alice'),bob=await h.register('bob'),eve=await h.register('eve');const bobPhone=await h.login(bob);
    const direct=await h.direct(alice,bob);
    const aliceWs=await h.listen(alice,address),bobWs=await h.listen(bob,address),phoneWs=await h.listen(bobPhone,address),eveWs=await h.listen(eve,address);
    const url=`/conversations/${direct}/calls`;const payload={clientId:randomUUID(),mode:'video'};

    assert.equal((await h.call(eve,'POST',url,payload)).statusCode,404);
    assert.equal((await h.app.inject({method:'POST',url:`/api/v1${url}`,headers:{origin,cookie:alice.cookie},payload})).statusCode,403);
    assert.equal((await h.app.inject({method:'POST',url:`/api/v1${url}`,headers:{...h.headers(alice),origin:'https://evil.test'},payload})).statusCode,403);
    const [first,retry]=await Promise.all([h.call(alice,'POST',url,payload),h.call(alice,'POST',url,payload)]);
    assert.deepEqual([first.statusCode,retry.statusCode].sort(),[200,201]);assert.equal(first.json().id,retry.json().id);
    const call=first.json();matches('Call',call);assert.deepEqual([call.state,call.topology],['ringing','p2p']);
    assert.equal((await h.call(alice,'POST',url,{...payload,mode:'audio'})).statusCode,409);
    assert.equal((await h.call(bob,'POST',url,{clientId:randomUUID(),mode:'audio'})).statusCode,409);

    await bobWs.until(event('call.invitation',call.id));await phoneWs.until(event('call.invitation',call.id));
    await aliceWs.until(event('call.updated',call.id,'ringing'));
    const ringing=await h.call(bob,'GET','/calls?state=ringing');matches('CallList',ringing.json());assert.equal(ringing.json().items[0].id,call.id);
    assert.deepEqual((await h.call(bob,'GET','/calls?state=active')).json().items,[]);
    assert.deepEqual((await h.call(eve,'GET','/calls?state=ringing')).json().items,[]);

    const signals=`/calls/${call.id}/signals`;const mine=`/calls/${call.id}/participants/me`;
    assert.equal((await h.call(alice,'POST',signals,{type:'offer',data:{sdp:'early'}})).statusCode,409);
    assert.equal((await h.call(eve,'PUT',mine,{state:'joined'})).statusCode,404);
    const joined=await h.call(bob,'PUT',mine,{state:'joined'});assert.equal(joined.statusCode,200,joined.body);assert.equal(joined.json().state,'active');
    assert.equal((await h.call(bobPhone,'PUT',mine,{state:'joined'})).statusCode,409,'a second device cannot take the call');
    await aliceWs.until(event('call.updated',call.id,'active'));await phoneWs.until(event('call.updated',call.id,'active'));

    // Une vraie offre vidéo dépasse la taille d'une notification PostgreSQL.
    const sdp='v=0\r\n'+'a=candidate:x\r\n'.repeat(900);assert.ok(sdp.length>9000);
    for(let i=0;i<3;i++)assert.equal((await h.call(alice,'POST',signals,{type:i?'ice':'offer',data:{sdp,n:i}})).statusCode,202);
    await bobWs.until(f=>event('call.signal',call.id)(f)&&f.data.data.n===2);
    assert.deepEqual(bobWs.frames.filter(event('call.signal',call.id)).map(f=>f.data.data.n),[0,1,2],'signals keep their order');
    assert.equal(bobWs.frames.find(event('call.signal',call.id)).data.from,alice.id);
    await new Promise(r=>setTimeout(r,200));
    assert.equal(phoneWs.frames.filter(event('call.signal',call.id)).length,0,'only the participating session gets signals');
    assert.equal(aliceWs.frames.filter(event('call.signal',call.id)).length,0);
    assert.equal(eveWs.frames.filter(f=>f.type==='user_event').length,0);
    assert.equal((await h.call(bobPhone,'POST',signals,{type:'answer',data:{}})).statusCode,403);
    assert.equal((await h.call(eve,'POST',signals,{type:'answer',data:{}})).statusCode,404);
    assert.equal((await h.call(alice,'POST',signals,{type:'ice',data:{blob:'x'.repeat(31_000)}})).statusCode,400);
    assert.equal((await h.call(alice,'POST',`/calls/${call.id}/media-tokens`)).statusCode,409,'a direct call has no SFU room');

    // Fermer la session qui participe termine l'appel pour le correspondant.
    assert.equal((await h.call(bob,'DELETE','/sessions/current')).statusCode,204);
    const dropped=await aliceWs.until(event('call.updated',call.id,'ended'));assert.equal(dropped.data.reason,'disconnected');
    assert.equal((await h.call(alice,'POST',signals,{type:'ice',data:{}})).statusCode,409);

    const start=async(who:Who,mode='audio')=>{const r=await h.call(who,'POST',url,{clientId:randomUUID(),mode});assert.equal(r.statusCode,201,r.body);return r.json().id as string;};
    const declined=await start(alice);
    assert.equal((await h.call(bobPhone,'PUT',`/calls/${declined}/participants/me`,{state:'declined'})).json().state,'ended');
    assert.equal((await aliceWs.until(event('call.updated',declined,'ended'))).data.reason,'declined');

    const unanswered=await start(alice);
    await h.pool.query("update calls.calls set created_at=now()-interval '2 minutes' where id=$1",[unanswered]);
    await h.services.calls.sweep();
    assert.equal((await aliceWs.until(event('call.updated',unanswered,'ended'))).data.reason,'expired');

    // Une session expirée sans déconnexion est repérée par le balayage.
    const stale=await start(alice);
    const bobTablet=await h.login(bobPhone);
    await h.call(bobTablet,'PUT',`/calls/${stale}/participants/me`,{state:'joined'});
    await h.pool.query("update identity.sessions set revoked_at=now() where id=(select session_id from calls.participants where call_id=$1 and user_id=$2)",[stale,bob.id]);
    await h.services.calls.sweep();
    assert.equal((await aliceWs.until(event('call.updated',stale,'ended'))).data.reason,'disconnected');

    const hung=await start(alice);
    assert.equal((await h.call(eve,'PATCH',`/calls/${hung}`,{state:'ended'})).statusCode,404);
    const ended=await h.call(alice,'PATCH',`/calls/${hung}`,{state:'ended'});assert.equal(ended.json().state,'ended');matches('Call',ended.json());
    assert.equal((await h.call(bobPhone,'PUT',`/calls/${hung}/participants/me`,{state:'joined'})).statusCode,409);

    // Sans SFU configuré, un groupe ne peut pas lancer de conférence.
    const group=(await h.call(alice,'POST','/groups',{clientId:randomUUID(),title:'Conf',memberIds:[bobPhone.id,eve.id]})).json();
    const conference=await h.call(alice,'POST',`/conversations/${group.id}/calls`,{clientId:randomUUID(),mode:'video'});
    assert.equal(conference.statusCode,409);assert.equal(conference.json().code,'CONFERENCE_UNAVAILABLE');

    const ice=await h.call(alice,'GET','/ice-servers');assert.equal(ice.statusCode,200);assert.equal(ice.headers['cache-control'],'no-store');matches('IceServerList',ice.json());
    const [stun,turn]=ice.json().iceServers;assert.deepEqual(stun.urls,['stun:turn.example.test:3478']);
    assert.deepEqual(turn.urls,['turn:turn.example.test:3478?transport=udp','turns:turn.example.test:5349?transport=tcp']);
    assert.ok(turn.username.endsWith(`:${alice.id}`));assert.ok(Number(turn.username.split(':')[0])<=Math.floor(Date.now()/1000)+3600);
    assert.equal(turn.credential,createHmac('sha1','turn-test-secret').update(turn.username).digest('base64'));
    assert.ok(!ice.body.includes('turn-test-secret'));
    assert.equal((await h.call(undefined,'GET','/ice-servers')).statusCode,401);
  }finally{delete process.env.TURN_HOST;delete process.env.TURN_SECRET;await h.close();}
});

test('calls: conference admission, eviction of a removed member and room closing',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const orders:string[]=[];let failures=1;
  const real=livekitFromEnv({LIVEKIT_URL:'wss://chat.test/livekit',LIVEKIT_API_URL:'http://sfu.test:7880',LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'secret'} as NodeJS.ProcessEnv)!;
  const media={admit:real.admit,
    removeParticipant:async(room:string,identity:string)=>{if(failures-->0)throw new Error('SFU injoignable');orders.push(`remove ${room} ${identity}`);},
    closeRoom:async(room:string)=>{orders.push(`close ${room}`);}};
  const h=await startApp({media,background:false});
  try{
    await h.pool.query('delete from calls.media_jobs');
    const alice=await h.register('alice'),bob=await h.register('bob'),carol=await h.register('carol'),eve=await h.register('eve');
    const group=(await h.call(alice,'POST','/groups',{clientId:randomUUID(),title:'Conf',memberIds:[bob.id,carol.id]})).json();
    const created=await h.call(alice,'POST',`/conversations/${group.id}/calls`,{clientId:randomUUID(),mode:'video'});
    assert.equal(created.statusCode,201,created.body);const call=created.json();assert.equal(call.topology,'sfu');
    const token=(who:Who)=>h.call(who,'POST',`/calls/${call.id}/media-tokens`);
    assert.equal((await token(bob)).statusCode,409,'join before asking for a room token');
    assert.equal((await token(eve)).statusCode,404);
    assert.equal((await h.call(bob,'PUT',`/calls/${call.id}/participants/me`,{state:'joined'})).statusCode,200);
    const admission=await token(bob);assert.equal(admission.statusCode,201,admission.body);matches('MediaToken',admission.json());
    const claims=JSON.parse(Buffer.from(admission.json().token.split('.')[1],'base64url').toString());
    assert.equal(claims.sub,bob.id);assert.equal(claims.video.room,`chatisen_${call.id}`);assert.ok(claims.exp-claims.iat<=60);assert.notEqual(claims.video.roomAdmin,true);
    assert.equal((await token(await h.login(bob))).statusCode,409,'another session of the same user is not admitted');
    assert.equal((await h.call(carol,'PUT',`/calls/${call.id}/participants/me`,{state:'joined'})).statusCode,200);

    assert.equal((await h.call(alice,'DELETE',`/groups/${group.id}/members/${bob.id}`)).statusCode,204);
    await h.services.calls.removeDepartedMembers();
    assert.equal((await token(bob)).statusCode,404);
    await h.services.calls.runMediaJobs();
    assert.deepEqual(orders,[],'the first attempt failed and stays pending');
    await h.pool.query('update calls.media_jobs set run_after=now()');
    await h.services.calls.runMediaJobs();
    assert.deepEqual(orders,[`remove chatisen_${call.id} ${bob.id}`,`remove chatisen_${call.id} ${bob.id}`],'immediate eviction, then one after the token expires');

    orders.length=0;
    for(const who of [carol,alice])assert.equal((await h.call(who,'PUT',`/calls/${call.id}/participants/me`,{state:'left'})).statusCode,200);
    assert.equal((await token(alice)).statusCode,409,'the call is over');
    await h.services.calls.runMediaJobs();
    assert.deepEqual(orders,[`close chatisen_${call.id}`]);
  }finally{await h.close();}
});
