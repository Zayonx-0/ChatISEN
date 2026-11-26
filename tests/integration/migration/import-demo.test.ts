import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,scryptSync} from 'node:crypto';
import {importDemo} from '../../../db/import-demo.mjs';
import {matches,startApp,type Who} from '../helpers.js';

// Même calcul que apps/standalone/server.mjs : le sel hexadécimal est employé comme texte.
const standaloneHash=(password:string,salt=randomBytes(16).toString('hex'))=>`${salt}:${scryptSync(password,salt,64).toString('hex')}`;

test('demo import: accounts keep their password, history keeps its order, rerun adds nothing',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const h=await startApp();
  try{
    const at=(second:number)=>new Date(Date.UTC(2026,10,24,10,0,second)).toISOString();
    const user=(name:string)=>({id:randomUUID(),handle:`${name}_${h.suffix}`,displayName:name,passwordHash:standaloneHash('ancien-8'),createdAt:at(0)});
    const [ana,ben]=[user('ana'),user('ben')];
    const direct=randomUUID(),group=randomUUID(),orphan=randomUUID();
    const message=(conversationId:string,seq:number,senderId:string,text:string,clientMessageId:string='')=>({id:randomUUID(),conversationId,seq,senderId,text,clientMessageId,createdAt:at(seq)});
    const shared=randomUUID();
    const data={users:[ana,ben],
      conversations:[{id:direct,type:'direct',title:'',createdAt:at(0),lastSeq:3},{id:group,type:'group',title:'Projet',createdAt:at(0),lastSeq:0},{id:orphan,type:'direct',title:'',createdAt:at(0),lastSeq:0}],
      members:[...[direct,group].flatMap(conversationId=>[ana,ben].map((u,index)=>({conversationId,userId:u.id,role:index?'member':'owner',joinedAt:at(index)}))),{conversationId:orphan,userId:ana.id,role:'owner',joinedAt:at(0)}],
      messages:[message(direct,7,ben.id,'troisième',shared),message(direct,2,ana.id,'premier'),message(direct,5,ben.id,'deuxième',shared),message(direct,9,ana.id,'   ')]};
    const run=async()=>{const client=await h.pool.connect();try{await client.query('BEGIN');const report=await importDemo(client,data);await client.query('COMMIT');return report;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
    assert.deepEqual(await run(),{users:2,conversations:2,members:4,messages:3,alreadyPresent:0,skipped:2});
    assert.deepEqual(await run(),{users:0,conversations:0,members:0,messages:0,alreadyPresent:4,skipped:1});

    const login=async(handle:string,password:string)=>h.call(undefined,'POST','/sessions',{handle,password});
    assert.equal((await login(ana.handle,'mauvais-mot-de-passe')).statusCode,401);
    const first=await login(ana.handle,'ancien-8');assert.equal(first.statusCode,201,first.body);
    const stored=(await h.pool.query('select password_hash from identity.users where id=$1',[ana.id])).rows[0].password_hash;
    assert.match(stored,/^\$argon2id\$/,'the hash is upgraded at the first successful sign-in');
    assert.equal((await login(ana.handle,'ancien-8')).statusCode,201);
    const who:Who={id:ana.id,handle:ana.handle,csrf:first.json().csrfToken,cookie:String(first.headers['set-cookie']).split(';')[0]};

    const list=await h.call(who,'GET','/conversations');matches('ConversationList',list.json());
    assert.deepEqual(list.json().items.map((c:{id:string})=>c.id).sort(),[direct,group].sort());
    const detail=await h.call(who,'GET',`/conversations/${group}`);assert.equal(detail.json().role,'owner');matches('ConversationDetail',detail.json());
    const history=await h.call(who,'GET',`/conversations/${direct}/messages`);matches('MessagePage',history.json());
    assert.deepEqual(history.json().items.map((m:{text:string;seq:string})=>[m.seq,m.text]),[['1','premier'],['2','deuxième'],['3','troisième']]);
    const events=await h.call(who,'GET',`/conversations/${direct}/events?afterSeq=0`);matches('EventPage',events.json());assert.equal(events.json().items.length,3);
    const next=await h.call(who,'POST',`/conversations/${direct}/messages`,{clientId:randomUUID(),text:'après la reprise'});
    assert.equal(next.statusCode,201,next.body);assert.equal(next.json().seq,'4');
    // Une conversation privée retrouvée n'est pas recréée.
    assert.equal((await h.call(who,'POST','/conversations',{peerId:ben.id})).json().id,direct);

    const taken={...data,users:[{...ana,id:randomUUID()}]};
    const client=await h.pool.connect();
    try{await assert.rejects(importDemo(client,taken),/déjà pris/);}finally{client.release();}
  }finally{await h.close();}
});
