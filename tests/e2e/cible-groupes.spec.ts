import {test,expect,type Browser,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {Client} from 'pg';

let origin:string;let apiUrl:string;let api:ChildProcess;let vite:ChildProcess;
async function freePort():Promise<number>{const server=createServer();await new Promise<void>((ok,ko)=>{server.once('error',ko);server.listen(0,'127.0.0.1',ok);});const address=server.address();if(!address||typeof address==='string')throw new Error('Port indisponible');const port=address.port;await new Promise<void>(ok=>server.close(()=>ok()));return port;}
async function waitFor(url:string,child:ChildProcess){for(let i=0;i<150;i++){if(child.exitCode!==null)throw new Error(`Server exited: ${child.exitCode}`);try{if((await fetch(url)).ok)return;}catch{}await new Promise(ok=>setTimeout(ok,100));}throw new Error(`Server not ready: ${url}`);}
async function stop(child:ChildProcess){if(child.exitCode!==null)return;await new Promise<void>(ok=>{child.once('exit',()=>ok());child.kill('SIGTERM');});}
async function register(page:Page,handle:string,name:string){await page.goto(origin);await page.getByRole('button',{name:'Créer un compte'}).click();await page.getByLabel('Nom affiché').fill(name);await page.getByLabel('Identifiant').fill(handle);await page.getByLabel('Mot de passe').fill('test-password-2026');await page.getByRole('button',{name:'S’inscrire'}).click();await expect(page.getByRole('button',{name:'Déconnexion'})).toBeVisible();}

test.beforeAll(async()=>{
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL est requis pour le parcours navigateur');
  const apiPort=await freePort(),webPort=await freePort();apiUrl=`http://127.0.0.1:${apiPort}`;origin=`http://127.0.0.1:${webPort}`;
  api=spawn(process.execPath,['--import','tsx',resolve('tests/e2e/support/api-local.ts')],{env:{...process.env,PORT:String(apiPort),CORS_ORIGIN:origin,CSRF_SECRET:'e2e-test-only',CHATISEN_E2E_OPERATIONS:'true'},stdio:'inherit'});
  await waitFor(`${apiUrl}/readyz`,api);
  vite=spawn(process.execPath,['apps/web/node_modules/vite/bin/vite.js','apps/web','--config','apps/web/vite.config.ts'],{stdio:'inherit',env:{...process.env,CHATISEN_WEB_PORT:String(webPort),CHATISEN_API_TARGET:apiUrl}});
  await waitFor(origin,vite);
});
test.afterAll(async()=>{if(vite)await stop(vite);if(api)await stop(api);});

test('cible : rôles de groupe, pièce jointe et administration depuis le navigateur',async({browser}:{browser:Browser})=>{
  test.setTimeout(120000);const suffix=randomBytes(4).toString('hex');
  const open=async()=>{const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();return {context,page};};
  const [a,b,c]=[await open(),await open(),await open()];const alice=a.page,bob=b.page,carol=c.page;
  const failures:string[]=[];for(const page of [alice,bob,carol])page.on('pageerror',e=>failures.push(e.message));
  alice.on('dialog',dialog=>void dialog.accept(dialog.type()==='prompt'?'Équipe projet':undefined));
  const search=async(page:Page,label:string,handle:string)=>{const form=page.locator('form.contact-search',{has:page.getByLabel(label)});await page.getByLabel(label).fill(handle);await form.getByRole('button',{name:'Rechercher'}).click();};
  const member=(page:Page,name:string)=>page.getByRole('region',{name:'Gestion du groupe'}).getByRole('listitem').filter({hasText:name});
  try{
    await register(alice,`alice_${suffix}`,'Alice');await register(bob,`bob_${suffix}`,'Bob');await register(carol,`carol_${suffix}`,'Carol');
    await search(alice,'Rechercher un contact',`bob_${suffix}`);await alice.getByRole('button',{name:'Créer un groupe avec ce contact'}).click();
    await expect(alice.getByRole('heading',{name:'Équipe projet'})).toBeVisible();

    // Ajout, renommage et nomination d'un modérateur par la propriétaire.
    await alice.getByRole('button',{name:'Membres'}).click();
    await search(alice,'Ajouter un membre',`carol_${suffix}`);await alice.getByRole('button',{name:'Ajouter au groupe'}).click();
    await expect(member(alice,'Carol')).toBeVisible();
    await alice.getByLabel('Nom du groupe').fill('Projet CHAT');await alice.getByRole('button',{name:'Renommer'}).click();
    await expect(alice.getByRole('heading',{name:'Projet CHAT'})).toBeVisible();
    await alice.getByRole('button',{name:'Membres'}).click().catch(()=>{});
    if(!await alice.getByRole('region',{name:'Gestion du groupe'}).isVisible())await alice.getByRole('button',{name:'Membres'}).click();
    await member(alice,'Bob').getByRole('button',{name:'Nommer modérateur'}).click();
    await expect(member(alice,'Bob')).toContainText('Modérateur');

    // Le modérateur retire un membre simple et n'a aucune autre action.
    await bob.getByRole('button',{name:/Projet CHAT/}).click();await bob.getByRole('button',{name:'Membres'}).click();
    await expect(bob.getByRole('button',{name:'Transférer la propriété'})).toHaveCount(0);
    await expect(bob.getByLabel('Ajouter un membre')).toHaveCount(0);
    await carol.getByRole('button',{name:/Projet CHAT/}).click();await expect(carol.getByRole('heading',{name:'Projet CHAT'})).toBeVisible();
    await member(bob,'Carol').getByRole('button',{name:'Retirer'}).click();
    await expect(member(bob,'Carol')).toHaveCount(0);
    await expect(carol.getByRole('button',{name:/Projet CHAT/})).toHaveCount(0);
    await expect(carol.getByRole('heading',{name:'Projet CHAT'})).toHaveCount(0);

    // Pièce jointe : envoi direct au stockage, puis téléchargement par l'autre membre.
    const content=Buffer.from('%PDF-1.7\ncompte rendu '+suffix);
    const signed=alice.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.endsWith('/files'));
    await alice.getByLabel('Fichier à joindre').setInputFiles({name:'compte rendu.pdf',mimeType:'application/pdf',buffer:content});
    await alice.getByLabel('Message',{exact:true}).fill('Voici le compte rendu');await alice.getByRole('button',{name:'Envoyer'}).click();
    await expect(bob.getByText('Voici le compte rendu')).toBeVisible();
    const {uploadUrl,headers}=await (await signed).json();
    const putAgain=await alice.evaluate(async({uploadUrl,headers,body})=>
      (await fetch(uploadUrl,{method:'PUT',headers,body,credentials:'omit'})).status,
    {uploadUrl,headers,body:'x'.repeat(content.length)});
    expect(putAgain).toBe(412);
    const [download]=await Promise.all([bob.waitForEvent('download'),bob.getByRole('button',{name:'Télécharger compte rendu.pdf'}).click()]);
    expect(download.suggestedFilename()).toBe('compte rendu.pdf');
    expect((await readFile((await download.path())!)).equals(content)).toBe(true);
    await alice.getByLabel('Fichier à joindre').setInputFiles({name:'faux.pdf',mimeType:'application/pdf',buffer:Buffer.from('MZ pas un PDF')});
    await alice.getByRole('button',{name:'Envoyer'}).click();
    await expect(alice.getByRole('alert')).toContainText('ne correspond pas');
    await alice.getByRole('button',{name:'Retirer le fichier'}).click();

    // Transfert de propriété puis départ de l'ancienne propriétaire.
    await member(alice,'Bob').getByRole('button',{name:'Transférer la propriété'}).click();
    await expect(member(alice,'Bob')).toContainText('Propriétaire');
    await alice.getByRole('button',{name:'Quitter le groupe'}).click();
    await expect(alice.getByRole('button',{name:/Projet CHAT/})).toHaveCount(0);

    // Administration : le rôle est donné par l'exploitant, jamais par l'interface.
    await expect(alice.getByRole('link',{name:'Administration'})).toHaveCount(0);
    const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
    try{await db.query("update identity.users set global_role='admin' where handle=$1",[`alice_${suffix}`]);}finally{await db.end();}
    await alice.reload();await alice.getByRole('link',{name:'Administration'}).click();
    await expect(alice).toHaveURL(origin+'/administration');
    await alice.getByRole('button',{name:'Comptes',exact:true}).click();
    await alice.getByLabel('Identifiant ou nom').fill(`carol_${suffix}`);
    await alice.getByRole('button',{name:'Rechercher',exact:true}).click();
    const account=alice.getByRole('listitem').filter({hasText:`@carol_${suffix}`});
    await account.getByRole('button',{name:'Désactiver',exact:true}).click();
    await expect(alice.getByRole('status')).toContainText('Compte désactivé');
    await carol.reload();await expect(carol.getByRole('button',{name:'Se connecter'})).toBeVisible();
    await account.getByRole('button',{name:'Réactiver',exact:true}).click();
    await expect(alice.getByRole('status')).toContainText('Compte réactivé');
    expect(failures).toEqual([]);
  }finally{await a.context.close();await b.context.close();await c.context.close();}
});

test('lot D : console mobile, avertissement, confirmation et journal filtré',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const handle='lotd_mobile_'+randomBytes(4).toString('hex');
  await register(page,handle,'Webmaster de test');
  await page.goto(origin+'/administration');
  await expect(page.getByText('Accès réservé aux administrateurs.')).toBeVisible();
  const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
  try{
    await db.query("update identity.users set global_role='admin' where handle=$1",[handle]);
    const conversations:string[]=[];
    page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/v1/conversations'))conversations.push(request.url());});
    await page.reload();
    await expect(page.getByRole('heading',{name:'Santé des services'})).toBeVisible();
    await expect(page.locator('.admin-metric svg').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole('button',{name:'Serveurs',exact:true}).click();
    await page.getByRole('button',{name:'Redémarrer coturn'}).click();
    await expect(page.getByRole('alert')).toContainText('Les appels relayés par coturn seront coupés.');
    await page.getByLabel('Nom de la VM').fill('chatisen-turn-e2e');
    await page.getByLabel('Mot de passe').fill('test-password-2026');
    await page.getByRole('button',{name:'Confirmer le redémarrage'}).click();
    await expect(page.getByText('Redémarrage demandé. Vérification en cours.')).toBeVisible();
    await page.getByRole('button',{name:'Journal d’audit',exact:true}).click();
    await page.getByLabel('Type de cible').selectOption('server');
    // Le journal garde aussi les entrées des tests précédents : la plus récente suffit.
    await expect(page.getByRole('listitem').getByText('Redémarrage demandé',{exact:true}).first()).toBeVisible();
    expect(conversations).toEqual([]);
  }finally{
    await db.query(`update operations.restart_gate set retry_at=null,operation_id=null,actor_id=null,target=null,
      vm_name=null,boot_before=null,started_at=null,uncertainty_audited=false where vm_name='chatisen-turn-e2e'`);
    await db.end();
  }
});
