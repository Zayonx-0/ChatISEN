import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes,randomUUID} from 'node:crypto';
import {matches,startApp,type Who} from '../helpers.js';

test('notifications: rights, retries, revocation and single delivery across replicas',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const sent:{endpoint:string;payload:any;ttl:number}[]=[];const failures=new Map<string,number>();
  const push={publicKey:'test-public-key',send:async(subscription:{endpoint:string},payload:string,ttl:number)=>{
    const status=failures.get(subscription.endpoint);if(status)throw Object.assign(new Error('refused'),{statusCode:status});
    sent.push({endpoint:subscription.endpoint,payload:JSON.parse(payload),ttl});}};
  // Deux réplicas, boucle automatique coupée : le test déclenche chaque envoi.
  const h=await startApp({push,background:false,metricsRoute:true}),replica=await startApp({push,background:false});
  const flush=async()=>{await Promise.all([h.services.notifications.run(),replica.services.notifications.run()]);await new Promise(r=>setTimeout(r,150));};
  const keys=()=>{const ecdh=createECDH('prime256v1');ecdh.generateKeys();return {p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')};};
  const endpoint=(name:string)=>`https://fcm.googleapis.com/fcm/send/${name}-${h.suffix}`;
  const subscribe=(who:Who,url:string)=>h.call(who,'POST','/push-subscriptions',{endpoint:url,keys:keys(),expirationTime:null});
  const mine=()=>sent.filter(s=>s.endpoint.endsWith(h.suffix));
  const metric=async(name:string)=>{
    const response=await h.app.inject('/metrics');assert.equal(response.statusCode,200);
    const value=response.body.split('\n').find(line=>line.startsWith(name+' '));
    assert.ok(value,name);return Number(value.slice(name.length+1));
  };
  try{
    // Les autres fichiers de test partagent la base : seuls les événements de ce passage comptent.
    await h.pool.query('update realtime.outbox set processed_at=now() where processed_at is null');
    await h.pool.query('delete from notifications.push_deliveries');
    const alice=await h.register('alice'),bob=await h.register('bob'),eve=await h.register('eve');
    assert.equal((await h.call(undefined,'GET','/push-configuration')).statusCode,401);
    const configuration=await h.call(bob,'GET','/push-configuration');matches('PushConfiguration',configuration.json());
    assert.deepEqual(configuration.json(),{available:true,publicKey:'test-public-key'});
    const plain=await startApp();
    try{const user=await plain.register('plain');assert.equal((await plain.call(user,'POST','/push-subscriptions',{endpoint:endpoint('x'),keys:keys()})).statusCode,503);}finally{await plain.close();}
    for(const bad of ['http://fcm.googleapis.com/x','https://localhost/x','https://169.254.169.254/x','https://evil.test/x','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com:8443/x'])assert.equal((await subscribe(bob,bad)).statusCode,400,bad);
    const bobSub=await subscribe(bob,endpoint('bob'));assert.equal(bobSub.statusCode,201,bobSub.body);matches('PushSubscriptionRef',bobSub.json());
    await subscribe(alice,endpoint('alice'));await subscribe(eve,endpoint('eve'));
    const conversation=await h.direct(alice,bob);
    const post=(text:string,clientId=randomUUID())=>h.call(alice,'POST',`/conversations/${conversation}/messages`,{clientId,text});

    const clientId=randomUUID();const message=(await post('contenu privé',clientId)).json();await post('contenu privé',clientId);await flush();await flush();
    assert.deepEqual(mine().map(s=>s.endpoint),[endpoint('bob')],'one delivery, to the other member only');
    assert.deepEqual(mine()[0].payload,{type:'message',conversationId:conversation,messageId:message.id,senderName:'alice'});
    assert.ok(mine()[0].ttl>0&&mine()[0].ttl<=120);assert.ok(!JSON.stringify(mine()[0].payload).includes('contenu privé'));

    // La boucle d'une vraie instance envoie sans qu'on l'appelle.
    sent.length=0;const live=await startApp({push});
    try{await post('envoi automatique');for(let i=0;i<100&&!mine().length;i++)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,150));}finally{await live.close();}
    assert.equal(mine().length,1,'the background loop delivers once');

    const failed='chatisen_push_events_total{event="failed"}',retried='chatisen_push_events_total{event="retry"}';
    const expired='chatisen_push_events_total{event="expired"}',outboxAge='chatisen_outbox_oldest_pending_seconds';
    const failedBefore=await metric(failed),retriesBefore=await metric(retried),expiredBefore=await metric(expired);
    sent.length=0;failures.set(endpoint('bob'),500);await post('panne du fournisseur');await flush();
    const pending=(await h.pool.query("select d.attempts from notifications.push_deliveries d join notifications.push_subscriptions s on s.id=d.subscription_id where s.endpoint=$1 and d.state='pending'",[endpoint('bob')])).rows;
    assert.deepEqual(pending,[{attempts:1}]);
    assert.equal(await metric(failed),failedBefore+1);
    failures.clear();await h.pool.query('update notifications.push_deliveries set available_at=now()');await flush();
    assert.equal(mine().length,1,'retried once the provider answers again');
    assert.equal(await metric(retried),retriesBefore+1);

    sent.length=0;await post('trop vieux');await h.pool.query("update realtime.outbox set created_at=now()-interval '3 minutes' where processed_at is null");
    assert.ok(await metric(outboxAge)>=180);
    await flush();
    assert.equal(mine().length,0,'expired after 120 seconds');
    assert.equal(await metric(expired),expiredBefore+1);
    assert.equal(await metric(outboxAge),0);

    // Un appel qui ne sonne plus n'est pas annoncé après coup.
    sent.length=0;failures.set(endpoint('bob'),500);
    const ring=(await h.call(alice,'POST',`/conversations/${conversation}/calls`,{clientId:randomUUID(),mode:'audio'})).json();await flush();
    await h.call(alice,'PATCH',`/calls/${ring.id}`,{state:'ended'});failures.clear();
    await h.pool.query('update notifications.push_deliveries set available_at=now()');await flush();
    assert.equal(mine().filter(s=>s.payload.type==='call').length,0,'a finished call is dropped');
    const second=(await h.call(alice,'POST',`/conversations/${conversation}/calls`,{clientId:randomUUID(),mode:'video'})).json();await flush();
    assert.deepEqual(mine().map(s=>s.payload),[{type:'call',conversationId:conversation,senderName:'alice',callId:second.id,mode:'video'}]);
    assert.ok(mine()[0].ttl<=45);await h.call(alice,'PATCH',`/calls/${second.id}`,{state:'ended'});await flush();

    sent.length=0;failures.set(endpoint('bob'),410);await post('abonnement disparu');await flush();failures.clear();
    assert.equal((await h.pool.query('select 1 from notifications.push_subscriptions where endpoint=$1',[endpoint('bob')])).rowCount,0);

    await subscribe(bob,endpoint('bob2'));
    assert.equal((await h.call(bob,'DELETE',`/push-subscriptions/${randomUUID()}`)).statusCode,404);
    const again=(await subscribe(bob,endpoint('bob2'))).json();
    assert.equal((await h.call(eve,'DELETE',`/push-subscriptions/${again.id}`)).statusCode,404,'someone else cannot remove it');
    assert.equal((await h.call(bob,'DELETE','/sessions/current')).statusCode,204);
    sent.length=0;await post('après déconnexion');await flush();assert.equal(mine().length,0,'a closed session receives nothing');
  }finally{await replica.close();await h.close();}
});
