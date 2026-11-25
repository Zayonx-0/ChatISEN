import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import webpush from 'web-push';

test('push endpoints require the session and CSRF, persist subscriptions, and revoke on logout', async () => {
  const folder=await mkdtemp(join(tmpdir(),'chatisen-push-'));
  const dataFile=join(folder,'data.json');
  const reservation=createServer();
  reservation.listen(0,'127.0.0.1');
  await once(reservation,'listening');
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  const vapid=webpush.generateVAPIDKeys();
  const start=()=>spawn(process.execPath,['apps/standalone/server.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CHATISEN_DATA_FILE:dataFile,CHATISEN_VAPID_PUBLIC_KEY:vapid.publicKey,CHATISEN_VAPID_PRIVATE_KEY:vapid.privateKey}});
  let child=start();
  try {
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('server exited')})]);
    const registration=await fetch(origin+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'push_user',displayName:'Push',password:'test-password'})});
    assert.equal(registration.status,200);
    const cookie=registration.headers.get('set-cookie').split(';')[0];
    const {csrf}=await registration.json();
    const headers={'Content-Type':'application/json',cookie,'x-csrf-token':csrf};
    const config=await fetch(origin+'/api/push/config',{headers:{cookie}});
    assert.deepEqual(await config.json(),{available:true,publicKey:vapid.publicKey});
    const ecdh=createECDH('prime256v1');ecdh.generateKeys();
    const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test-token',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
    assert.equal((await fetch(origin+'/api/push/subscriptions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sub)})).status,401);
    assert.equal((await fetch(origin+'/api/push/subscriptions',{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify(sub)})).status,403);
    assert.equal((await fetch(origin+'/api/push/subscriptions',{method:'POST',headers,body:JSON.stringify({...sub,endpoint:'https://localhost/private'})})).status,400);
    assert.equal((await fetch(origin+'/api/push/subscriptions',{method:'POST',headers,body:JSON.stringify(sub)})).status,200);
    assert.equal(JSON.parse(await readFile(dataFile,'utf8')).pushSubscriptions.length,1);
    const stopped=once(child,'exit');child.kill('SIGTERM');await stopped;
    child=start();await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('server exited')})]);
    assert.equal(JSON.parse(await readFile(dataFile,'utf8')).pushSubscriptions.length,1);
    assert.equal((await fetch(origin+'/api/auth/me',{headers:{cookie}})).status,200);
    assert.equal((await fetch(origin+'/api/auth/logout',{method:'POST',headers})).status,200);
    assert.equal(JSON.parse(await readFile(dataFile,'utf8')).pushSubscriptions.length,0);
    assert.equal((await fetch(origin+'/api/push/config',{headers:{cookie}})).status,401);
  } finally {
    child.kill('SIGTERM');
    await rm(folder,{recursive:true,force:true});
  }
});
