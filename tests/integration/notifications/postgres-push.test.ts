import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Pool} from 'pg';
import {applyMigrations} from '../../../db/migrate.mjs';

const require=createRequire(new URL('../../../apps/api/package.json',import.meta.url));
const Fastify=require('fastify');const cookie=require('@fastify/cookie');

test('notifications: rights, retries, revocation and single delivery across replicas',async t=>{
  const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)return t.skip('DATABASE_URL not set');
  const origin='https://chatisen.test';process.env.CORS_ORIGIN=origin;process.env.CSRF_SECRET='integration-only';
  const pool=new Pool({connectionString:databaseUrl});const client=await pool.connect();try{await applyMigrations(client);}finally{client.release();}
  const {PostgresRepository}=await import('../../../apps/api/src/repositories/postgres.js');
  const {registerPostgresIdentity}=await import('../../../apps/api/src/identity/postgres-routes.js');
  const {registerPostgresChat}=await import('../../../apps/api/src/chat/postgres-routes.js');
  const {registerNotifications}=await import('../../../apps/api/src/modules/notifications/routes.js');
  const {PushDispatcher}=await import('../../../apps/api/src/modules/notifications/dispatcher.js');
  // Other test files share this database: only this run's deliveries matter.
  await pool.query('delete from push_outbox');
  const sent:{endpoint:string;payload:any;ttl:number}[]=[];const failures=new Map<string,number>();
  const push={publicKey:'test-public-key',send:async(subscription:{endpoint:string},payload:string,ttl:number)=>{
    const status=failures.get(subscription.endpoint);if(status)throw Object.assign(new Error('refused'),{statusCode:status});
    sent.push({endpoint:subscription.endpoint,payload:JSON.parse(payload),ttl});}};
  const repo=new PostgresRepository(databaseUrl);const app=Fastify();await app.register(cookie);
  await registerPostgresIdentity(app,repo);await registerPostgresChat(app,repo);await registerNotifications(app,repo,undefined);
  const withPush=Fastify();await withPush.register(cookie);await registerNotifications(withPush,repo,push);
  const quiet=()=>{};const one=new PushDispatcher(repo,push,quiet),two=new PushDispatcher(repo,push,quiet);
  const flush=async()=>{await Promise.all([one.run(),two.run()]);await new Promise(r=>setTimeout(r,150));};
  const suffix=randomBytes(5).toString('hex');
  const register=async(prefix:string)=>{const r=await app.inject({method:'POST',url:'/api/v1/auth/register',headers:{origin},payload:{handle:`${prefix}_${suffix}`,displayName:prefix,password:'secure-password-2026'}});assert.equal(r.statusCode,201,r.body);return {cookie:String(r.headers['set-cookie']).split(';')[0],id:r.json().user.id as string,csrf:r.json().user.csrfToken as string};};
  type Who=Awaited<ReturnType<typeof register>>;
  const headers=(who:Who)=>({origin,cookie:who.cookie,'x-csrf-token':who.csrf});
  const keys=()=>{const ecdh=createECDH('prime256v1');ecdh.generateKeys();return {p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')};};
  const endpoint=(name:string)=>`https://fcm.googleapis.com/fcm/send/${name}-${suffix}`;
  const subscribe=(who:Who,url:string,target=withPush)=>target.inject({method:'POST',url:'/api/v1/push-subscriptions',headers:headers(who),payload:{endpoint:url,keys:keys()}});
  const mine=()=>sent.filter(s=>s.endpoint.endsWith(suffix));
  try{
    const alice=await register('alice'),bob=await register('bob'),eve=await register('eve');
    assert.equal((await withPush.inject({method:'GET',url:'/api/v1/push-configuration'})).statusCode,401);
    assert.deepEqual((await withPush.inject({method:'GET',url:'/api/v1/push-configuration',headers:{cookie:bob.cookie}})).json(),{available:true,publicKey:'test-public-key'});
    assert.equal((await subscribe(bob,endpoint('x'),app)).statusCode,503);
    for(const bad of ['http://fcm.googleapis.com/x','https://localhost/x','https://169.254.169.254/x','https://evil.test/x','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com:8443/x'])assert.equal((await subscribe(bob,bad)).statusCode,400,bad);
    const bobSub=await subscribe(bob,endpoint('bob'));assert.equal(bobSub.statusCode,201,bobSub.body);
    await subscribe(alice,endpoint('alice'));await subscribe(eve,endpoint('eve'));
    const conversation=(await app.inject({method:'POST',url:'/api/v1/conversations/direct',headers:headers(alice),payload:{peerId:bob.id}})).json();
    const post=async(text:string,clientId=randomUUID())=>app.inject({method:'POST',url:`/api/v1/conversations/${conversation.id}/messages`,headers:headers(alice),payload:{clientId,text}});

    const clientId=randomUUID();const message=(await post('contenu privé',clientId)).json();await post('contenu privé',clientId);await flush();
    assert.deepEqual(mine().map(s=>s.endpoint),[endpoint('bob')],'one delivery, to the other member only');
    assert.deepEqual(mine()[0].payload,{type:'message',conversationId:conversation.id,messageId:message.id,senderName:'alice'});
    assert.ok(mine()[0].ttl>0&&mine()[0].ttl<=120);assert.ok(!JSON.stringify(mine()[0].payload).includes('contenu privé'));

    sent.length=0;failures.set(endpoint('bob'),500);await post('panne du fournisseur');await flush();
    let state=(await pool.query("select state,attempts from push_deliveries d join push_subscriptions s on s.id=d.subscription_id where s.endpoint=$1 and state='pending'",[endpoint('bob')])).rows[0];
    assert.equal(state.attempts,1);
    failures.clear();await pool.query('update push_deliveries set available_at=now()');await flush();
    assert.equal(mine().length,1,'retried once the provider answers again');

    sent.length=0;await post('trop vieux');await pool.query("update push_outbox set created_at=now()-interval '3 minutes' where expanded_at is null");await flush();
    assert.equal(mine().length,0,'expired after 120 seconds');

    sent.length=0;failures.set(endpoint('bob'),410);await post('abonnement disparu');await flush();failures.clear();
    assert.equal((await pool.query('select 1 from push_subscriptions where endpoint=$1',[endpoint('bob')])).rowCount,0);

    await subscribe(bob,endpoint('bob2'));
    assert.equal((await withPush.inject({method:'DELETE',url:`/api/v1/push-subscriptions/${randomUUID()}`,headers:headers(bob)})).statusCode,404);
    const again=(await subscribe(bob,endpoint('bob2'))).json();
    assert.equal((await withPush.inject({method:'DELETE',url:`/api/v1/push-subscriptions/${again.id}`,headers:headers(eve)})).statusCode,404,'someone else cannot remove it');
    assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:headers(bob)})).statusCode,204);
    sent.length=0;await post('après déconnexion');await flush();assert.equal(mine().length,0,'a closed session receives nothing');
  }finally{await withPush.close();await app.close();await repo.close();await pool.end();}
});
