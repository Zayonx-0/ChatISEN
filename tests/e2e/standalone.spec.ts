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
  await bob.reload();await bob.getByRole('button',{name:/Alice/}).click();await expect(bob.locator('#messages p').getByText('Bonjour Bob',{exact:true})).toBeVisible();
  await bob.getByLabel('Message').fill('Bonjour Alice');await bob.getByRole('button',{name:'Envoyer'}).click();await expect(alice.locator('#messages p').getByText('Bonjour Alice',{exact:true})).toBeVisible();
  await alice.reload();await expect(alice.locator('#messages p').getByText('Bonjour Alice',{exact:true})).toBeVisible();
  await alice.getByPlaceholder('Rechercher un handle').fill('bob_e2e');await alice.getByRole('button',{name:/@bob_e2e/}).click();await alice.getByLabel('Message').fill('Direct existant');await alice.getByRole('button',{name:'Envoyer'}).click();await expect(alice.locator('#messages p').getByText('Direct existant',{exact:true})).toBeVisible();
  await alice.getByRole('button',{name:'Déconnexion'}).click();await expect(alice.getByRole('button',{name:'Se connecter'})).toBeVisible();
  await alice.locator('[name=handle]').fill('alice_e2e');await alice.locator('[name=password]').fill('motdepasse-test');await alice.getByRole('button',{name:'Se connecter'}).click();await expect(alice.locator('#messages p').getByText('Direct existant',{exact:true})).toBeVisible();
 }finally{await a.close();await b.close();}
});
