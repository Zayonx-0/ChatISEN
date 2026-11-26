import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {origin,startApp,WebSocket,type Who} from '../helpers.js';

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
