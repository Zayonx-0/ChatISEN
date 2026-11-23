import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {PostgresRepository} from '../../../apps/api/src/repositories/postgres.js';
import {applyMigrations} from '../../../db/migrate.mjs';

const url=process.env.DATABASE_URL;

test('C PostgreSQL repository: F02 F04 S02 concurrent retries, rollback and revocation',async t=>{
  if(!url)return t.skip('DATABASE_URL not set');
  const pool=new Pool({connectionString:url,max:12});const repo=new PostgresRepository(pool);
  const suffix=randomBytes(5).toString('hex');
  try{
    // Runner transactions must stay on one connection, never a Pool.
    const migrationClient=await pool.connect();
    try{await applyMigrations(migrationClient)}finally{migrationClient.release()}
    const alice=await repo.createUser(`a_${suffix}`,'Alice','hash');
    const bob=await repo.createUser(`b_${suffix}`,'Bob','hash');
    const eve=await repo.createUser(`e_${suffix}`,'Eve','hash');
    const tokenHash=randomBytes(32).toString('hex');
    const session=await repo.createSession(alice.id,tokenHash);
    assert.equal((await repo.findSession(tokenHash))?.id,session.id);

    const [conversation,other]=await Promise.all([repo.createDirectConversation(alice.id,bob.id),repo.createDirectConversation(bob.id,alice.id)]);
    assert.equal(conversation.id,other.id);
    assert.equal(await repo.isMember(conversation.id,alice.id),true);
    const sameKey=randomUUID();
    const concurrent=await Promise.all(Array.from({length:8},()=>repo.appendMessage(conversation.id,alice.id,'bonjour',sameKey)));
    assert.equal(concurrent.filter(x=>x.created).length,1);
    assert.equal(new Set(concurrent.map(x=>x.message.id)).size,1);
    await assert.rejects(repo.appendMessage(conversation.id,alice.id,'modifié',sameKey),/idempotency_conflict/);
    const contestedKey=randomUUID();
    const contested=await Promise.allSettled([
      repo.appendMessage(conversation.id,alice.id,'première commande',contestedKey),
      repo.appendMessage(conversation.id,alice.id,'commande différente',contestedKey)
    ]);
    assert.equal(contested.filter(x=>x.status==='fulfilled').length,1);
    const rejected=contested.find(x=>x.status==='rejected');
    assert.ok(rejected&&rejected.status==='rejected');
    assert.match(String(rejected.reason),/idempotency_conflict/);
    await assert.rejects(repo.appendMessage(conversation.id,eve.id,'intrusion',randomUUID()),/forbidden/);

    // Invalid message insertion must roll back the event and allocated seq.
    await assert.rejects(repo.appendMessage(conversation.id,alice.id,' ',randomUUID()));
    const state=await pool.query('select last_seq,(select count(*)::int from messages where conversation_id=$1) messages,(select count(*)::int from conversation_events where conversation_id=$1) events from conversations where id=$1',[conversation.id]);
    assert.deepEqual(state.rows[0],{last_seq:'2',messages:2,events:2});

    // Hold the same row lock a removal needs: removal must wait until the write
    // commits. Once the removal commits, even an existing idempotency key is denied.
    const locker=await pool.connect();
    try{
      await locker.query('BEGIN');
      await locker.query('select 1 from conversation_members where conversation_id=$1 and user_id=$2 for update',[conversation.id,bob.id]);
      let finished=false;
      const blocked=repo.appendMessage(conversation.id,bob.id,'après retrait',randomUUID()).finally(()=>{finished=true});
      await delay(100);assert.equal(finished,false,'write must wait for membership row lock');
      await locker.query('update conversation_members set left_at=now() where conversation_id=$1 and user_id=$2',[conversation.id,bob.id]);
      await locker.query('COMMIT');
      await assert.rejects(blocked,/forbidden/);
    }finally{await locker.query('ROLLBACK').catch(()=>{});locker.release()}
    await pool.query('update conversation_members set left_at=now() where conversation_id=$1 and user_id=$2',[conversation.id,alice.id]);
    await assert.rejects(repo.appendMessage(conversation.id,alice.id,'bonjour',sameKey),/forbidden/);
    assert.equal((await repo.listMessages(conversation.id)).length,2);
    await repo.revokeSession(session.id);assert.equal(await repo.findSession(tokenHash),undefined);
  }finally{await repo.close()}
});
