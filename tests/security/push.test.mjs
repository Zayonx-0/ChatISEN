import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH, randomBytes} from 'node:crypto';
import webpush from 'web-push';
import {createPushService} from '../../apps/standalone/push.mjs';

function subscription(id) {
  const ecdh=createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint:`https://fcm.googleapis.com/fcm/send/${id}`,
    keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')},
  };
}

test('push subscriptions stay scoped to an active session and conversation membership', async () => {
  const keys=webpush.generateVAPIDKeys();
  const db={
    sessions:[
      {id:'alice-session',userId:'alice',expiresAt:'2999-01-01T00:00:00.000Z'},
      {id:'bob-session',userId:'bob',expiresAt:'2999-01-01T00:00:00.000Z'},
      {id:'revoked',userId:'bob',revokedAt:'2026-01-01T00:00:00.000Z',expiresAt:'2999-01-01T00:00:00.000Z'},
      {id:'expired',userId:'bob',expiresAt:'2020-01-01T00:00:00.000Z'},
      {id:'other',userId:'eve',expiresAt:'2999-01-01T00:00:00.000Z'},
    ],
  };
  const sent=[];
  let saves=0;
  const service=createPushService({
    db,save:()=>saves++,member:(cid,user)=>cid==='chat'&&['alice','bob'].includes(user),
    publicKey:keys.publicKey,privateKey:keys.privateKey,subject:'https://example.test',
    sender:async (destination,payload)=>{sent.push({destination,payload:JSON.parse(payload)});},
  });
  assert.equal(service.available,true);
  const bob=subscription('bob'),alice=subscription('alice'),eve=subscription('eve');
  assert.equal(service.subscribe({id:'alice'},db.sessions[0],alice),'ok');
  assert.equal(service.subscribe({id:'bob'},db.sessions[1],bob),'ok');
  assert.equal(service.subscribe({id:'bob'},db.sessions[2],subscription('revoked')),'ok');
  assert.equal(service.subscribe({id:'bob'},db.sessions[3],subscription('expired')),'ok');
  assert.equal(service.subscribe({id:'eve'},db.sessions[4],eve),'ok');
  assert.equal(service.subscribe({id:'bob'},db.sessions[1],{...bob,endpoint:'https://127.0.0.1/private'}),'invalid');
  assert.equal(service.subscribe({id:'bob'},db.sessions[1],{...bob,endpoint:'https://fcm.googleapis.com.evil.test/x'}),'invalid');
  await service.deliverMessage('chat',{id:'message-1'},{id:'alice',displayName:'Alice'});
  assert.equal(sent.length,1);
  assert.equal(sent[0].destination.endpoint,bob.endpoint);
  assert.deepEqual(sent[0].payload,{type:'message',conversationId:'chat',messageId:'message-1',senderName:'Alice'});
  service.unsubscribe(db.sessions[0],bob.endpoint);
  assert.equal(db.pushSubscriptions.some(item=>item.subscription.endpoint===bob.endpoint),true);
  service.revoke(db.sessions[1]);
  assert.equal(db.pushSubscriptions.some(item=>item.subscription.endpoint===bob.endpoint),false);
  assert.ok(saves>0);
});

test('expired endpoints are removed without deleting a later replacement', async () => {
  const keys=webpush.generateVAPIDKeys();
  const db={sessions:[{id:'bob-session',userId:'bob',expiresAt:'2999-01-01T00:00:00.000Z'}]};
  const bob=subscription('gone');
  const service=createPushService({db,save:()=>{},member:()=>true,publicKey:keys.publicKey,privateKey:keys.privateKey,subject:'https://example.test',sender:async()=>{throw Object.assign(new Error('expired'),{statusCode:410});}});
  service.subscribe({id:'bob'},db.sessions[0],bob);
  await service.deliverMessage('chat',{id:'message-1'},{id:'alice',displayName:'Alice'});
  assert.equal(db.pushSubscriptions.length,0);
});

test('a stale failure cannot remove a refreshed subscription', async () => {
  const keys=webpush.generateVAPIDKeys();
  const db={sessions:[{id:'bob-session',userId:'bob',expiresAt:'2999-01-01T00:00:00.000Z'}]};
  const bob=subscription('replacement');
  let rejectDelivery;
  const service=createPushService({
    db,save:()=>{},member:()=>true,publicKey:keys.publicKey,privateKey:keys.privateKey,subject:'https://example.test',
    sender:()=>new Promise((resolve,reject)=>{rejectDelivery=reject;}),
  });
  service.subscribe({id:'bob'},db.sessions[0],bob);
  const delivery=service.deliverMessage('chat',{id:'message-1'},{id:'alice',displayName:'Alice'});
  service.subscribe({id:'bob'},db.sessions[0],bob);
  rejectDelivery(Object.assign(new Error('expired'),{statusCode:410}));
  await delivery;
  assert.equal(db.pushSubscriptions.length,1);
});
