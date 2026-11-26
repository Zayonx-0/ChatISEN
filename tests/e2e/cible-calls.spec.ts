import {test,expect,type Browser,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {createServer} from 'node:net';

let origin:string;let apiUrl:string;let api:ChildProcess;let vite:ChildProcess;
async function freePort():Promise<number>{const server=createServer();await new Promise<void>((ok,ko)=>{server.once('error',ko);server.listen(0,'127.0.0.1',ok);});const address=server.address();if(!address||typeof address==='string')throw new Error('Port indisponible');const port=address.port;await new Promise<void>(ok=>server.close(()=>ok()));return port;}
async function waitFor(url:string,child:ChildProcess){for(let i=0;i<150;i++){if(child.exitCode!==null)throw new Error(`Server exited: ${child.exitCode}`);try{if((await fetch(url)).ok)return;}catch{}await new Promise(ok=>setTimeout(ok,100));}throw new Error(`Server not ready: ${url}`);}
async function stop(child:ChildProcess){if(child.exitCode!==null)return;await new Promise<void>(ok=>{child.once('exit',()=>ok());child.kill('SIGTERM');});}
async function register(page:Page,handle:string,name:string){await page.goto(origin);await page.getByRole('button',{name:'Créer un compte'}).click();await page.getByLabel('Nom affiché').fill(name);await page.getByLabel('Identifiant').fill(handle);await page.getByLabel('Mot de passe').fill('test-password-2026');await page.getByRole('button',{name:'S’inscrire'}).click();await expect(page.getByRole('button',{name:'Déconnexion'})).toBeVisible();}
/** Compteurs RTP lus dans la connexion réelle : prouve que du son et des images arrivent. */
async function inbound(page:Page){return page.evaluate(async()=>{const pc=(window as any).__peers?.at(-1) as RTCPeerConnection|undefined;const out={audio:0,frames:0,state:pc?.connectionState??'none'};if(!pc)return out;(await pc.getStats()).forEach((s:any)=>{if(s.type==='inbound-rtp'&&s.kind==='audio')out.audio+=s.packetsReceived||0;if(s.type==='inbound-rtp'&&s.kind==='video')out.frames+=s.framesDecoded||0;});return out;});}
const trackPeers=()=>{const Native=window.RTCPeerConnection;(window as any).__peers=[];window.RTCPeerConnection=class extends Native{constructor(config?:RTCConfiguration){super(config);(window as any).__peers.push(this);}} as typeof RTCPeerConnection;};

test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL est requis pour le parcours navigateur');
  const apiPort=await freePort(),webPort=await freePort();apiUrl=`http://127.0.0.1:${apiPort}`;origin=`http://127.0.0.1:${webPort}`;
  api=spawn(process.execPath,['--import','tsx',resolve('apps/api/src/server.ts')],{env:{...process.env,HOST:'127.0.0.1',PORT:String(apiPort),CORS_ORIGIN:origin,CSRF_SECRET:'e2e-test-only'},stdio:'inherit'});
  await waitFor(`${apiUrl}/readyz`,api);
  vite=spawn(process.execPath,['apps/web/node_modules/vite/bin/vite.js','apps/web','--config','apps/web/vite.config.ts'],{stdio:'inherit',env:{...process.env,CHATISEN_WEB_PORT:String(webPort),CHATISEN_API_TARGET:apiUrl}});
  await waitFor(origin,vite);
});
test.afterAll(async()=>{if(vite)await stop(vite);if(api)await stop(api);});

test('cible : non lus, appel audio avec partage d’écran, appel vidéo, refus',async({browser}:{browser:Browser})=>{
  test.setTimeout(120000);const suffix=randomBytes(4).toString('hex');
  const make=async()=>{const context=await browser.newContext({permissions:['camera','microphone']});await context.addInitScript(trackPeers);return {context,page:await context.newPage()};};
  const a=await make(),b=await make();const alice=a.page,bob=b.page;
  const failures:string[]=[];for(const page of [alice,bob])page.on('pageerror',e=>failures.push(e.message));
  try{
    await register(alice,`alice_${suffix}`,'Alice');await register(bob,`bob_${suffix}`,'Bob');
    await alice.getByLabel('Rechercher un identifiant exact').fill(`bob_${suffix}`);await alice.getByRole('button',{name:'Rechercher',exact:true}).click();await alice.getByRole('button',{name:'Ouvrir une conversation'}).click();
    await expect(alice.getByRole('heading',{name:'Bob'})).toBeVisible();

    // Bob n'a pas ouvert la conversation : elle apparaît seule, avec notification et compteur.
    await alice.getByLabel('Message',{exact:true}).fill('Tu es là ?');await alice.getByRole('button',{name:'Envoyer'}).click();
    await expect(bob.getByRole('status').filter({hasText:'Nouveau message : Alice'})).toBeVisible();
    await expect(bob.getByLabel('1 message non lu')).toBeVisible();

    // Appel audio : la sonnerie arrive même sans conversation ouverte.
    await alice.getByRole('button',{name:'Appel audio'}).click();
    await expect(bob.getByRole('dialog',{name:'Appel entrant'})).toBeVisible();
    await bob.getByRole('button',{name:'Accepter'}).click();
    for(const page of [alice,bob]){await expect(page.getByRole('status').filter({hasText:'En communication'})).toBeVisible({timeout:20000});await expect.poll(async()=>(await inbound(page)).audio,{timeout:15000}).toBeGreaterThan(20);}
    await expect(alice.getByLabel('Qualité de la communication')).toBeVisible({timeout:20000});

    // Partage d'écran pendant un appel audio : des images arrivent chez le correspondant.
    await alice.evaluate(()=>{navigator.mediaDevices.getDisplayMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d')!;let n=0;setInterval(()=>{ctx.fillStyle=n++%2?'#3b5bdb':'#c92a2a';ctx.fillRect(0,0,640,360);},100);return canvas.captureStream(10);};});
    await alice.getByRole('button',{name:'Partager l’écran'}).click();
    await expect.poll(async()=>(await inbound(bob)).frames,{timeout:15000}).toBeGreaterThan(5);
    await alice.getByRole('button',{name:'Arrêter le partage'}).click();
    await alice.getByRole('button',{name:'Raccrocher'}).click();
    await expect(bob.getByRole('dialog')).toHaveCount(0);await expect(bob.getByRole('status').filter({hasText:'Appel terminé'})).toBeVisible();

    // Appel vidéo : images décodées des deux côtés, coupure du micro, raccrochage par l'appelé.
    await alice.getByRole('button',{name:'Appel vidéo'}).click();await bob.getByRole('button',{name:'Accepter'}).click();
    for(const page of [alice,bob])await expect.poll(async()=>(await inbound(page)).frames,{timeout:20000}).toBeGreaterThan(10);
    await bob.getByRole('button',{name:'Couper le micro'}).click();await expect(bob.getByRole('button',{name:'Réactiver le micro'})).toBeVisible();
    await bob.getByRole('button',{name:'Raccrocher'}).click();await expect(alice.getByRole('dialog')).toHaveCount(0);

    // Refus.
    await alice.getByRole('button',{name:'Appel audio'}).click();await bob.getByRole('button',{name:'Refuser'}).click();
    await expect(alice.getByRole('status').filter({hasText:'Appel refusé'})).toBeVisible();

    // Un rechargement pendant la sonnerie retrouve l'appel.
    await alice.getByRole('button',{name:'Appel audio'}).click();await expect(bob.getByRole('dialog',{name:'Appel entrant'})).toBeVisible();
    await bob.reload();await expect(bob.getByRole('dialog',{name:'Appel entrant'})).toBeVisible();
    await alice.getByRole('button',{name:'Raccrocher'}).click();await expect(bob.getByRole('dialog')).toHaveCount(0);
    expect(failures).toEqual([]);
  }finally{await a.context.close();await b.context.close();}
});
