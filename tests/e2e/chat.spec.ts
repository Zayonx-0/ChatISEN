import {test,expect,type Browser,type BrowserContext,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {createServer} from 'node:net';

let origin:string;let apiUrl:string;let api:ChildProcess;let vite:ChildProcess;
async function freePort():Promise<number>{const server=createServer();await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const address=server.address();if(!address||typeof address==='string')throw new Error('Port indisponible');const port=address.port;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;}
async function waitFor(url:string,child:ChildProcess){for(let i=0;i<150;i++){if(child.exitCode!==null)throw new Error(`Server exited: ${child.exitCode}`);try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server not ready: ${url}`);}
function startApi(){return spawn(process.execPath,['--import','tsx',resolve('apps/api/src/server.ts')],{env:{...process.env,HOST:'127.0.0.1',PORT:new URL(apiUrl).port,CORS_ORIGIN:origin,CSRF_SECRET:'e2e-test-only'},stdio:'inherit'});}
async function stop(child:ChildProcess){if(child.exitCode!==null)return;await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM');});}
async function register(page:Page,handle:string,name:string){await page.goto(origin);await page.getByRole('button',{name:'Créer un compte'}).click();await page.getByLabel('Nom affiché').fill(name);await page.getByLabel('Identifiant').fill(handle);await page.getByLabel('Mot de passe').fill('test-password-2026');await page.getByRole('button',{name:'S’inscrire'}).click();await expect(page.getByRole('button',{name:'Déconnexion'})).toBeVisible();}
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL est requis pour le parcours navigateur');const apiPort=await freePort(),webPort=await freePort();apiUrl=`http://127.0.0.1:${apiPort}`;origin=`http://127.0.0.1:${webPort}`;api=startApi();await waitFor(`${apiUrl}/readyz`,api);vite=spawn(process.execPath,['apps/web/node_modules/vite/bin/vite.js','apps/web','--config','apps/web/vite.config.ts'],{stdio:'inherit',env:{...process.env,CHATISEN_WEB_PORT:String(webPort),CHATISEN_API_TARGET:apiUrl}});await waitFor(origin,vite);});
test.afterAll(async()=>{if(vite)await stop(vite);if(api)await stop(api);});
test('F01 F02 F03 F04 F05 F13 : direct, groupe, reprise et historique après redémarrage',async({browser}:{browser:Browser},testInfo)=>{
  test.setTimeout(90000);const suffix=randomBytes(4).toString('hex');const aliceHandle=`alice_${suffix}`,bobHandle=`bob_${suffix}`;
  const aliceContext:BrowserContext=await browser.newContext({viewport:{width:1280,height:800}}),bobContext:BrowserContext=await browser.newContext({viewport:{width:390,height:844}}),eveContext:BrowserContext=await browser.newContext();
  await aliceContext.tracing.start({screenshots:true,snapshots:true,sources:true});await bobContext.tracing.start({screenshots:true,snapshots:true,sources:true});
  const alice=await aliceContext.newPage(),bob=await bobContext.newPage(),eve=await eveContext.newPage();
  try{
    await register(alice,aliceHandle,'Alice');await register(bob,bobHandle,'Bob');await register(eve,`eve_${suffix}`,'Eve');
    for(const context of [aliceContext,bobContext]){const cookie=(await context.cookies()).find(c=>c.name==='__Host-chatisen');expect(cookie).toMatchObject({secure:true,httpOnly:true,path:'/',sameSite:'Lax'});}
    await alice.getByLabel('Rechercher un contact').fill(bobHandle);await alice.getByRole('button',{name:'Rechercher',exact:true}).click();const createResponse=alice.waitForResponse(r=>r.url().endsWith('/api/v1/conversations')&&r.request().method()==='POST');await alice.getByRole('button',{name:'Ouvrir une conversation'}).click();const cid=(await (await createResponse).json()).id as string;
    const third=await eve.evaluate(async(id)=>{const r=await fetch(`/api/v1/conversations/${id}/messages`);return r.status;},cid);expect(third).toBe(404);
    await expect(alice.getByRole('heading',{name:'Bob'})).toBeVisible();
    await bob.reload();await bob.getByRole('button',{name:/Alice/}).click();await expect(bob.getByRole('heading',{name:'Alice'})).toBeVisible();
    await alice.getByLabel('Message').fill('Bonjour Bob');await alice.getByRole('button',{name:'Envoyer'}).click();await expect(bob.getByText('Bonjour Bob')).toBeVisible();
    await bob.getByLabel('Message').fill('Bonjour Alice');await bob.getByRole('button',{name:'Envoyer'}).click();await expect(alice.getByText('Bonjour Alice')).toBeVisible();
    await bobContext.setOffline(true);const offlineSince=Date.now();
    for(let i=1;i<=20;i++){await alice.getByLabel('Message').fill(`Absent ${i}`);await alice.getByRole('button',{name:'Envoyer'}).click();await expect(alice.getByText(`Absent ${i}`,{exact:true})).toHaveCount(1);}
    const remaining=15000-(Date.now()-offlineSince);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));await bobContext.setOffline(false);
    for(let i=1;i<=20;i++)await expect(bob.getByText(`Absent ${i}`,{exact:true})).toHaveCount(1,{timeout:15000});
    await bob.getByRole('button',{name:'← Conversations'}).click();await expect(bob.getByRole('heading',{name:'Conversations'})).toBeVisible();
    await alice.getByLabel('Rechercher un contact').fill(bobHandle);await alice.getByRole('button',{name:'Rechercher',exact:true}).click();alice.once('dialog',dialog=>void dialog.accept('Équipe test'));await alice.getByRole('button',{name:'Créer un groupe avec ce contact'}).click();await expect(alice.getByRole('heading',{name:'Équipe test'})).toBeVisible();
    await bob.reload();await bob.getByRole('button',{name:/Équipe test/}).click();await expect(bob.getByRole('heading',{name:'Équipe test'})).toBeVisible();await alice.getByLabel('Message').fill('Bonjour le groupe');await alice.getByRole('button',{name:'Envoyer'}).click();await expect(bob.getByText('Bonjour le groupe')).toBeVisible();
    await bob.getByRole('button',{name:'← Conversations'}).click();await bob.getByRole('button',{name:/Alice/}).click();await expect(bob.getByText('Bonjour Bob')).toBeVisible();
    await stop(api);api=startApi();await waitFor(`${apiUrl}/readyz`,api);await alice.reload();await alice.getByRole('button',{name:/Bob/}).click();await expect(alice.getByText('Bonjour Bob')).toBeVisible();await expect(alice.getByText('Bonjour Alice')).toBeVisible();
  }finally{await aliceContext.tracing.stop({path:testInfo.outputPath('alice-trace.zip')});await bobContext.tracing.stop({path:testInfo.outputPath('bob-trace.zip')});await aliceContext.close();await bobContext.close();await eveContext.close();}
});
