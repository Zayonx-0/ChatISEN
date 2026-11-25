import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';

let server:ChildProcess,origin:string,dir:string;
test.beforeAll(async()=>{
  dir=await mkdtemp(join(tmpdir(),'chatisen-standalone-e2e-'));
  const port=await new Promise<number>((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const address=s.address();if(!address||typeof address==='string')return reject(new Error('Pas de port'));s.close(()=>resolve(address.port));});});
  origin=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['apps/standalone/server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',CHATISEN_DATA_FILE:join(dir,'data.json'),COOKIE_SECURE:'false'},stdio:'inherit'});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error(`Serveur arrêté : ${server.exitCode}`);try{if((await fetch(origin)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
  throw new Error('Serveur standalone indisponible');
});
test.afterAll(async()=>{if(server&&server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');if(dir)await rm(dir,{recursive:true,force:true});});
async function register(page:Page,handle:string,name:string){await page.goto(origin);await page.getByRole('button',{name:'Créer un compte'}).click();await page.locator('[name=handle]').fill(handle);await page.locator('[name=displayName]').fill(name);await page.locator('[name=password]').fill('motdepasse-test');await page.getByRole('button',{name:'S’inscrire'}).click();await expect(page.getByRole('button',{name:'Déconnexion'})).toBeVisible();}
test('standalone : inscription, direct, messages, rechargement et mobile',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext({viewport:{width:390,height:844}});const alice=await a.newPage(),bob=await b.newPage();
 try{
  await register(alice,'alice_e2e','Alice');await register(bob,'bob_e2e','Bob');
  await alice.reload();await expect(alice.getByRole('button',{name:'Déconnexion'})).toBeVisible();
  await alice.getByPlaceholder('Rechercher un handle').fill('bob_e2e');await alice.getByRole('button',{name:/@bob_e2e/}).click();
  await alice.getByLabel('Message').fill('Bonjour Bob');await alice.getByRole('button',{name:'Envoyer'}).click();await expect(alice.locator('#messages p').getByText('Bonjour Bob',{exact:true})).toBeVisible();
  await bob.getByRole('button',{name:/Alice/}).click();await expect(bob.locator('#messages p').getByText('Bonjour Bob',{exact:true})).toBeVisible();
  await bob.getByLabel('Message').fill('Bonjour Alice');await bob.getByRole('button',{name:'Envoyer'}).click();await expect(alice.locator('#messages p').getByText('Bonjour Alice',{exact:true})).toBeVisible();
  await alice.reload();await expect(alice.locator('#messages p').getByText('Bonjour Alice',{exact:true})).toBeVisible();
  await alice.getByPlaceholder('Rechercher un handle').fill('bob_e2e');await alice.getByRole('button',{name:/@bob_e2e/}).click();await alice.getByLabel('Message').fill('Direct existant');await alice.getByRole('button',{name:'Envoyer'}).click();await expect(alice.locator('#messages p').getByText('Direct existant',{exact:true})).toBeVisible();
  await alice.getByRole('button',{name:'Déconnexion'}).click();await expect(alice.getByRole('button',{name:'Se connecter'})).toBeVisible();
  await alice.locator('[name=handle]').fill('alice_e2e');await alice.locator('[name=password]').fill('motdepasse-test');await alice.getByRole('button',{name:'Se connecter'}).click();await expect(alice.locator('#messages p').getByText('Direct existant',{exact:true})).toBeVisible();
 }finally{await a.close();await b.close();}
});

test('standalone : notifications et appels audio et vidéo entre deux sessions',async({browser})=>{
  test.setTimeout(60000);
  const a=await browser.newContext({permissions:['microphone','camera','notifications']}),b=await browser.newContext({permissions:['microphone','camera','notifications']}),c=await browser.newContext();
  const alice=await a.newPage(),bob=await b.newPage(),charlie=await c.newPage();
  const mediaReceived=async(page:Page,kind:'audio'|'video')=>page.evaluate(async wanted=>{
    const peer=(0,eval)('state.peer') as RTCPeerConnection|null;if(!peer)return 0;const stats=await peer.getStats();let result=0;
    stats.forEach(stat=>{if(stat.type==='inbound-rtp'&&stat.kind===wanted)result+=wanted==='video'?(stat.framesDecoded||0):(stat.bytesReceived||0)});return result;
  },kind);
  try{
    expect((await alice.request.get(origin+'/readyz')).status()).toBe(200);
    await register(alice,'alice_call','Alice');await register(bob,'bob_call','Bob');await register(charlie,'charlie_call','Charlie');
    expect(await alice.evaluate(async()=>(await (await fetch('/api/config')).json()).iceServers)).toEqual([]);
    await bob.getByRole('button',{name:'Activer les notifications'}).click();await expect(bob.getByRole('status').filter({hasText:'Notifications : activées'})).toBeVisible();
    await alice.getByPlaceholder('Rechercher un handle').fill('bob_call');await alice.getByRole('button',{name:/@bob_call/}).click();
    await bob.getByRole('button',{name:/Alice/}).click();
    await bob.getByPlaceholder('Rechercher un handle').fill('charlie_call');await bob.getByRole('button',{name:/@charlie_call/}).click();
    await alice.getByLabel('Message').fill('Notification de test');await alice.getByRole('button',{name:'Envoyer'}).click();
    await expect(bob.getByRole('status').filter({hasText:'Nouveau message'})).toBeVisible();await expect(bob.getByLabel('1 message(s) non lu(s)')).toBeVisible();
    const creation=alice.waitForResponse(r=>r.url().includes('/calls')&&r.request().method()==='POST');await alice.getByRole('button',{name:'Appel audio'}).click();const callId=(await (await creation).json()).call.id as string;
    const forbidden=await charlie.evaluate(async id=>{const me=await (await fetch('/api/auth/me')).json();return (await fetch(`/api/calls/${id}/answer`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':me.csrf},body:JSON.stringify({action:'accept'})})).status},callId);expect(forbidden).toBe(404);
    await expect(bob.getByRole('heading',{name:'Appel entrant'})).toBeVisible();await bob.getByRole('button',{name:'Accepter'}).click();
    await expect(alice.locator('#call-status')).toHaveText('Connecté',{timeout:15000});await expect(bob.locator('#call-status')).toHaveText('Connecté',{timeout:15000});
    await expect.poll(()=>mediaReceived(alice,'audio'),{timeout:15000}).toBeGreaterThan(0);await expect.poll(()=>mediaReceived(bob,'audio'),{timeout:15000}).toBeGreaterThan(0);
    await alice.getByRole('button',{name:'Couper le micro'}).click();await expect(alice.getByRole('button',{name:'Activer le micro'})).toBeVisible();expect(await alice.evaluate(()=>(0,eval)('state.stream.getAudioTracks()[0].enabled'))).toBe(false);await alice.getByRole('button',{name:'Activer le micro'}).click();expect(await alice.evaluate(()=>(0,eval)('state.stream.getAudioTracks()[0].enabled'))).toBe(true);await alice.getByRole('button',{name:'Raccrocher'}).click();await expect(bob.getByRole('heading',{name:'Appel en cours'})).toHaveCount(0);
    await alice.getByRole('button',{name:'Appel vidéo'}).click();await expect(bob.getByRole('heading',{name:'Appel entrant'})).toBeVisible();await bob.getByRole('button',{name:'Accepter'}).click();
    await expect.poll(()=>mediaReceived(alice,'video'),{timeout:15000}).toBeGreaterThan(0);await expect.poll(()=>mediaReceived(bob,'video'),{timeout:15000}).toBeGreaterThan(0);
    await bob.getByRole('button',{name:'Couper la caméra'}).click();await expect(bob.getByRole('button',{name:'Activer la caméra'})).toBeVisible();expect(await bob.evaluate(()=>(0,eval)('state.stream.getVideoTracks()[0].enabled'))).toBe(false);await bob.getByRole('button',{name:'Activer la caméra'}).click();expect(await bob.evaluate(()=>(0,eval)('state.stream.getVideoTracks()[0].enabled'))).toBe(true);await bob.getByRole('button',{name:'Raccrocher'}).click();await expect(alice.getByRole('heading',{name:'Appel en cours'})).toHaveCount(0);
    await alice.getByRole('button',{name:'Appel audio'}).click();await expect(bob.getByRole('heading',{name:'Appel entrant'})).toBeVisible();await bob.getByRole('button',{name:'Refuser'}).click();await expect(alice.getByRole('heading',{name:'Appel en attente'})).toHaveCount(0);
  }finally{await a.close();await b.close();await c.close();}
});
