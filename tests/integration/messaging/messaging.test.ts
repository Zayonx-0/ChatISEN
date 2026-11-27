import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {matches,startApp} from '../helpers.js';

test('messaging: idempotent concurrent writes, atomic numbering, pagination, catch-up and isolation',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const h=await startApp();
  try{
    const alice=await h.register('alice'),bob=await h.register('bob'),eve=await h.register('eve');
    const [one,two]=await Promise.all([h.call(alice,'POST','/conversations',{peerId:bob.id}),h.call(bob,'POST','/conversations',{peerId:alice.id})]);
    assert.deepEqual([one.statusCode,two.statusCode].sort(),[200,201]);const cid=one.json().id as string;assert.equal(cid,two.json().id);
    const url=`/conversations/${cid}/messages`;
    assert.equal((await h.call(eve,'GET',url)).statusCode,404);
    assert.equal((await h.call(eve,'POST',url,{clientId:randomUUID(),text:'intrusion'})).statusCode,404);
    for(const bad of [{clientId:randomUUID()},{clientId:randomUUID(),text:'   '},{clientId:'x',text:'a'},{clientId:randomUUID(),text:'a',senderId:bob.id},{clientId:randomUUID(),text:'a'.repeat(4001)}])
      assert.equal((await h.call(alice,'POST',url,bad)).statusCode,400,JSON.stringify(bad).slice(0,60));

    const key=randomUUID();
    const concurrent=await Promise.all(Array.from({length:8},()=>h.call(alice,'POST',url,{clientId:key,text:'bonjour'})));
    assert.equal(concurrent.filter(r=>r.statusCode===201).length,1);assert.equal(concurrent.filter(r=>r.statusCode===200).length,7);
    assert.equal(new Set(concurrent.map(r=>r.json().id)).size,1);matches('Message',concurrent[0].json());assert.equal(concurrent[0].json().seq,'1');
    assert.equal((await h.call(alice,'POST',url,{clientId:key,text:'différent'})).statusCode,409);
    assert.equal((await h.call(alice,'POST',url,{clientId:randomUUID(),fileId:randomUUID()})).statusCode,409,'an unknown file cannot be attached');

    // Le refus précédent n'a consommé aucun numéro : événement et message sont atomiques.
    const state=async()=>(await h.pool.query(`select s.last_seq::int,(select count(*)::int from messaging.messages where conversation_id=$1) as messages,
      (select count(*)::int from realtime.events where stream_id=$1) as events,(select count(*)::int from realtime.outbox where conversation_id=$1) as outbox
      from realtime.streams s where s.id=$1`,[cid])).rows[0];
    assert.deepEqual(await state(),{last_seq:1,messages:1,events:1,outbox:1});

    const writes=await Promise.all(Array.from({length:100},(_,i)=>h.call(i%2?alice:bob,'POST',url,{clientId:randomUUID(),text:`message ${i}`})));
    assert.ok(writes.every(r=>r.statusCode===201),writes.find(r=>r.statusCode!==201)?.body);
    let before='',pages=0;const seen:string[]=[],sequences:string[]=[];
    do{
      const page=await h.call(bob,'GET',`${url}?limit=50${before?`&beforeSeq=${before}`:''}`);assert.equal(page.statusCode,200);matches('MessagePage',page.json());
      const {items,nextBeforeSeq}=page.json();
      seen.push(...items.map((m:{id:string})=>m.id));sequences.push(...items.map((m:{seq:string})=>m.seq));before=nextBeforeSeq;pages++;
      if(before)assert.equal(before,items.at(-1).seq);
    }while(before);
    assert.equal(pages,3);assert.equal(seen.length,101);assert.equal(new Set(seen).size,101);
    assert.deepEqual(sequences,Array.from({length:101},(_,i)=>String(101-i)));

    const events=`/conversations/${cid}/events`;
    assert.equal((await h.call(bob,'GET',events)).statusCode,400);
    assert.equal((await h.call(eve,'GET',`${events}?afterSeq=0`)).statusCode,404);
    const head=await h.call(bob,'GET',`${events}?afterSeq=0&limit=100`);matches('EventPage',head.json());
    assert.deepEqual([head.json().items.length,head.json().hasMore,head.json().nextAfterSeq],[100,true,'100']);
    const tail=await h.call(bob,'GET',`${events}?afterSeq=100&limit=100`);
    assert.deepEqual([tail.json().items.length,tail.json().hasMore,tail.json().nextAfterSeq],[1,false,'101']);
    assert.ok(head.json().items[0].data.id);assert.equal(head.json().items[0].data.text,'bonjour');

    // Un retrait concurrent : l'envoi attend le verrou du membre, puis il est refusé.
    const group=(await h.call(alice,'POST','/groups',{clientId:randomUUID(),title:'Verrou',memberIds:[bob.id]})).json();
    const locker=await h.pool.connect();
    try{
      await locker.query('BEGIN');
      await locker.query('select 1 from groups.members where conversation_id=$1 and user_id=$2 for update',[group.id,bob.id]);
      let finished=false;
      const blocked=h.call(bob,'POST',`/conversations/${group.id}/messages`,{clientId:randomUUID(),text:'après retrait'}).finally(()=>{finished=true;});
      await delay(300);assert.equal(finished,false,'the write waits for the membership lock');
      await locker.query('update groups.members set left_at=now() where conversation_id=$1 and user_id=$2',[group.id,bob.id]);
      await locker.query('COMMIT');
      assert.equal((await blocked).statusCode,404);
    }finally{await locker.query('ROLLBACK').catch(()=>{});locker.release();}

    // Plus de 120 messages par minute : limite de débit, sans bloquer la reprise d'un envoi déjà fait.
    let limited=0;
    for(let i=0;i<80;i++)if((await h.call(alice,'POST',url,{clientId:randomUUID(),text:`rafale ${i}`})).statusCode===429)limited++;
    assert.ok(limited>0);
    assert.equal((await h.call(alice,'POST',url,{clientId:key,text:'bonjour'})).statusCode,200);
  }finally{await h.close();}
});
