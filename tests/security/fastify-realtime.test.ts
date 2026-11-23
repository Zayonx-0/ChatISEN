import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {addUser,addSession,createConversation,memory,key,pub} from '../../apps/api/src/store.js';
import {broadcast} from '../../apps/api/src/ws.js';
process.env.CORS_ORIGIN='https://chatisen.test';
const {default:app}=await import('../../apps/api/src/server.js');

test('S01 S02 Fastify refuses outsiders and revocation stops realtime delivery',async()=>{
  await app.ready();
  const alice=addUser('alice_test','Alice','x'),bob=addUser('bob_test','Bob','x'),eve=addUser('eve_test','Eve','x');
  const a=addSession(alice.id),b=addSession(bob.id),e=addSession(eve.id);
  const c=createConversation('group','Test',alice.id,[bob.id]);
  const headers=(raw:string,origin='https://chatisen.test')=>({cookie:`__Host-chatisen=${raw}`,origin});
  const aws=await app.injectWS('/api/ws',{headers:headers(a.raw)}), bws=await app.injectWS('/api/ws',{headers:headers(b.raw)}), ews=await app.injectWS('/api/ws',{headers:headers(e.raw)});
  const received=[0,0,0];for(const [i,s] of [aws,bws,ews].entries())s.on('message',v=>{try{if(JSON.parse(String(v)).type==='probe')received[i]++}catch{}});
  for(const s of [aws,bws,ews])s.send(JSON.stringify({subscribe:pub(c.id)}));
  await delay(30);broadcast(pub(c.id),{type:'probe'});await delay(50);assert.deepEqual(received,[1,1,0]);
  memory.members.get(key(c.id,bob.id))!.leftAt=new Date().toISOString();a.s.revokedAt=new Date().toISOString();
  broadcast(pub(c.id),{type:'probe'});await delay(50);assert.deepEqual(received,[1,1,0]);
  aws.terminate();bws.terminate();ews.terminate();await app.close();
});
