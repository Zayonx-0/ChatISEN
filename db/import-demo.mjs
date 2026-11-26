#!/usr/bin/env node
/**
 * Reprend les données de la démo standalone dans la base de la cible.
 *
 *   node db/import-demo.mjs [--apply] < chatisen.json
 *
 * Sans « --apply », tout est exécuté puis annulé : un essai complet sans rien écrire.
 * Repris : comptes (les mots de passe restent valables), conversations, membres, messages
 * et leur journal. Non repris : sessions (chacun se reconnecte), historique des appels et
 * abonnements Push (à réactiver). Relancer l'import n'ajoute rien de plus.
 * Seuls des nombres sont affichés, jamais de contenu.
 */
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legacyHash=/^[0-9a-f]{32}:[0-9a-f]{128}$/;

export async function importDemo(client,data){
  const report={users:0,conversations:0,members:0,messages:0,alreadyPresent:0,skipped:0};
  const refuse=reason=>{throw new Error(`import refusé : ${reason}`);};
  const known=new Set();
  for(const user of data.users){
    if(!uuid.test(user.id)||!/^[a-z0-9_]{3,32}$/.test(user.handle)||!legacyHash.test(user.passwordHash))refuse('un compte a un format inattendu');
    const holder=(await client.query('select id from identity.users where handle=$1',[user.handle])).rows[0];
    if(holder&&holder.id!==user.id)refuse('un identifiant est déjà pris par un autre compte de la cible');
    const added=await client.query('insert into identity.users(id,handle,display_name,password_hash,created_at) values($1,$2,$3,$4,$5) on conflict(id) do nothing',
      [user.id,user.handle,(user.displayName?.trim()||user.handle).slice(0,80),`scrypt:${user.passwordHash}`,user.createdAt]);
    report[added.rowCount?'users':'alreadyPresent']++;known.add(user.id);
  }
  for(const conversation of data.conversations){
    if(!uuid.test(conversation.id))refuse('une conversation a un identifiant inattendu');
    if((await client.query('select 1 from groups.conversations where id=$1',[conversation.id])).rowCount){report.alreadyPresent++;continue;}
    const members=data.members.filter(m=>m.conversationId===conversation.id&&!m.leftAt&&known.has(m.userId))
      .filter((m,index,all)=>all.findIndex(other=>other.userId===m.userId)===index);
    const direct=conversation.type==='direct';
    if(direct?members.length!==2:members.length<1){report.skipped++;continue;}
    const pair=direct?members.map(m=>m.userId).sort():[null,null];
    await client.query('insert into groups.conversations(id,type,title,direct_user_low,direct_user_high,created_at) values($1,$2,$3,$4,$5,$6)',
      [conversation.id,direct?'direct':'group',direct?null:(conversation.title?.trim()||'Groupe').slice(0,120),pair[0],pair[1],conversation.createdAt]);
    // Un groupe garde exactement un propriétaire ; à défaut, son membre le plus ancien le devient.
    const owner=direct?undefined:(members.find(m=>m.role==='owner')??[...members].sort((a,b)=>String(a.joinedAt).localeCompare(String(b.joinedAt)))[0]).userId;
    for(const member of members){
      await client.query('insert into groups.members(conversation_id,user_id,role,joined_at) values($1,$2,$3,$4)',
        [conversation.id,member.userId,member.userId===owner?'owner':'member',member.joinedAt??conversation.createdAt]);
      report.members++;
    }
    const all=data.messages.filter(m=>m.conversationId===conversation.id);
    const messages=all.filter(m=>uuid.test(m.id)&&known.has(m.senderId)&&typeof m.text==='string'&&m.text.trim()&&m.text.length<=4000)
      .sort((a,b)=>Number(a.seq)-Number(b.seq)||String(a.createdAt).localeCompare(String(b.createdAt)));
    report.skipped+=all.length-messages.length;
    await client.query('insert into realtime.streams(id,last_seq,updated_at) values($1,$2,$3)',
      [conversation.id,messages.length,messages.at(-1)?.createdAt??conversation.createdAt]);
    const keys=new Set();
    for(const [index,message] of messages.entries()){
      const seq=index+1;
      let clientId=uuid.test(message.clientMessageId??'')?message.clientMessageId:randomUUID();
      if(keys.has(`${message.senderId}:${clientId}`))clientId=randomUUID();
      keys.add(`${message.senderId}:${clientId}`);
      const payload={id:message.id,conversationId:conversation.id,senderId:message.senderId,clientId,text:message.text};
      await client.query("insert into realtime.events(stream_id,seq,event_type,entity_id,payload,occurred_at) values($1,$2,'message.created',$3,$4::jsonb,$5)",
        [conversation.id,seq,message.id,JSON.stringify(payload),message.createdAt]);
      await client.query("insert into messaging.messages(id,conversation_id,seq,sender_id,client_id,kind,text,created_at) values($1,$2,$3,$4,$5,'text',$6,$7)",
        [message.id,conversation.id,seq,message.senderId,clientId,message.text,message.createdAt]);
      report.messages++;
    }
    report.conversations++;
  }
  return report;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const apply=process.argv.includes('--apply');
  if(!process.env.DATABASE_URL){console.error('DATABASE_URL est obligatoire');process.exit(2);}
  const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const {default:pg}=await import('pg');
  const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
  try{
    await client.query('BEGIN');
    const report=await importDemo(client,data);
    await client.query(apply?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({applied:apply,source:{users:data.users.length,conversations:data.conversations.length,messages:data.messages.length},imported:report}));
  }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(error.message);process.exitCode=1;}
  finally{await client.end();}
}
