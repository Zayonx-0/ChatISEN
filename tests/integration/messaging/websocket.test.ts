import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {origin,startApp,WebSocket,type Who} from '../helpers.js';
import {publishToUsers,userEvent,type Target} from '../../../apps/api/src/platform/realtime.js';

test('realtime: wakes on PostgreSQL events, catches up and revalidates session and membership',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const h=await startApp();
  const address=await h.app.listen({host:'127.0.0.1',port:0});
  try{
    const alice=await h.register('alice'),bob=await h.register('bob'),eve=await h.register('eve');
    const refused=(headers:Record<string,string>)=>new Promise<number>((resolve,reject)=>{
      const ws=new WebSocket(address.replace('http','ws')+'/api/v1/ws',{headers});
      ws.once('unexpected-response',(_request:unknown,response:{statusCode?:number;resume():void})=>{response.resume();resolve(response.statusCode||0);});
      ws.once('open',()=>{ws.terminate();reject(Error('unexpected socket admission'));});
      ws.once('error',()=>{});
    });
    assert.equal(await refused({origin}),401);
    assert.equal(await refused({origin:'https://evil.test',cookie:alice.cookie}),403);

    const cid=await h.direct(alice,bob);
    const b=await h.listen(bob,address),outsider=await h.listen(eve,address);
    const subscribe=(socket:typeof b,afterSeq:string,conversationId=cid)=>socket.send({v:1,type:'subscribe',conversationId,afterSeq});
    subscribe(b,'0');subscribe(outsider,'0');
    await b.until(f=>f.type==='subscribed');
    assert.equal((await outsider.until(f=>f.type==='error')).error.code,'NOT_MEMBER');
    b.send({v:1,type:'ping'});await b.until(f=>f.type==='pong');

    const post=async(from:Who,conversationId:string,text:string)=>{const r=await h.call(from,'POST',`/conversations/${conversationId}/messages`,{clientId:randomUUID(),text});assert.equal(r.statusCode,201,r.body);};
    await post(alice,cid,'live');
    const live=await b.until(f=>f.type==='event'&&f.seq==='1');assert.equal(live.event,'message.created');assert.equal(live.data.text,'live');
    await b.until(f=>f.type==='conversation_list_changed'&&f.reason==='message');
    assert.equal(outsider.frames.filter(f=>f.type==='event'||f.type==='conversation_list_changed').length,0);
    b.socket.terminate();
    await Promise.all(Array.from({length:20},(_,i)=>post(alice,cid,`missed ${i}`)));
    const again=await h.listen(bob,address);subscribe(again,'1');
    await again.until(f=>f.type==='event'&&f.seq==='21');
    assert.deepEqual(again.frames.filter(f=>f.type==='event').map(f=>f.seq),Array.from({length:20},(_,i)=>String(i+2)));

    // Retiré d'un groupe : l'abonnement est coupé et plus aucun message ne passe.
    const group=(await h.call(alice,'POST','/groups',{clientId:randomUUID(),title:'Fil',memberIds:[bob.id]})).json();
    await again.until(f=>f.type==='conversation_list_changed'&&f.conversationId===group.id);
    subscribe(again,'0',group.id);await again.until(f=>f.type==='subscribed'&&f.conversationId===group.id);
    await again.until(f=>f.type==='event'&&f.conversationId===group.id&&f.event==='conversation.created');
    assert.equal((await h.call(alice,'DELETE',`/groups/${group.id}/members/${bob.id}`)).statusCode,204);
    await again.until(f=>f.type==='error'&&f.error.code==='NOT_MEMBER');
    await post(alice,group.id,'secret');await delay(300);
    assert.ok(!again.frames.some(f=>f.data?.text==='secret'));

    const before=again.frames.filter(f=>f.type==='event').length;
    assert.equal((await h.call(bob,'DELETE','/sessions/current')).statusCode,204);
    await post(alice,cid,'after logout');await delay(300);
    assert.equal(again.frames.filter(f=>f.type==='event').length,before);
  }finally{await h.close();}
});

test('realtime: replays personal events after WebSocket and LISTEN reconnects, including late commits',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const databaseUrl=new URL(process.env.DATABASE_URL),applicationName=`test-realtime-${randomUUID()}`;
  databaseUrl.searchParams.set('application_name',applicationName);
  const h=await startApp({databaseUrl:databaseUrl.toString(),background:false});
  const address=await h.app.listen({host:'127.0.0.1',port:0});
  const late=await h.pool.connect();
  try{
    const bob=await h.register('bob'),otherSession=await h.login(bob),eve=await h.register('eve');
    const sessionId=(await h.services.identity.verify(bob.cookie.split('=')[1]))!.session.id;
    const send=(label:string,target:Target={userId:bob.id,sessionId},event='call.signal')=>publishToUsers(h.pool,[target],userEvent(event,{label}));
    const frame=(label:string)=>(f:any)=>f.type==='user_event'&&f.data.label===label;
    await send('before opening');
    const first=await h.listen(bob,address);
    assert.ok(!first.frames.some(frame('before opening')));
    await late.query('begin');
    await publishToUsers(late,[{userId:bob.id,sessionId}],userEvent('call.signal',{label:'late commit'}));
    await send('early commit');
    const high=await first.until(frame('early commit'));
    first.socket.terminate();
    await late.query('commit');
    await send('invitation',{userId:bob.id},'call.invitation');

    const again=await h.listen(bob,address,true),wrongSession=await h.listen(otherSession,address,true),wrongUser=await h.listen(eve,address,true);
    const low=await again.until(frame('late commit'));
    assert.ok(BigInt(low.eventId)<BigInt(high.eventId));
    assert.equal((await again.until(frame('early commit'))).eventId,high.eventId);
    assert.deepEqual(first.frames.find(f=>f.type==='ready').seenUserEventIds,[(await again.until(frame('before opening'))).eventId]);
    await wrongSession.until(frame('invitation'));
    assert.ok(!wrongSession.frames.some(f=>frame('late commit')(f)||frame('early commit')(f)));
    assert.ok(!wrongUser.frames.some(f=>f.type==='user_event'));

    const listener=await h.pool.query("select pid from pg_stat_activity where application_name=$1 and query='LISTEN chatisen_user_events'",[applicationName]);
    assert.equal(listener.rowCount,1);
    assert.equal((await h.pool.query('select pg_terminate_backend($1) as stopped',[listener.rows[0].pid])).rows[0].stopped,true);
    await h.pool.query('insert into realtime.user_events(user_id,session_id,frame) values($1,$2,$3)',[bob.id,sessionId,userEvent('call.signal',{label:'during LISTEN outage'})]);
    await again.until(frame('during LISTEN outage'),4000);
    assert.equal(again.frames.filter(frame('early commit')).length,1);
    assert.ok(!wrongSession.frames.some(frame('during LISTEN outage')));
  }finally{await late.query('rollback');late.release();await h.close();}
});
