import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {PostgresRepository} from '../../../apps/api/src/repositories/postgres.js';
import {applyMigrations} from '../../../db/migrate.mjs';

const url=process.env.DATABASE_URL;
test('C repository persists session, direct conversation and idempotent messages',async t=>{
  if(!url)return t.skip('DATABASE_URL not set');
  const pool=new Pool({connectionString:url});const repo=new PostgresRepository(pool);
  try{
    await applyMigrations(pool as any);
    const suffix=Date.now().toString(36);const alice=await repo.createUser(`alice_${suffix}`,'Alice','hash');const bob=await repo.createUser(`bob_${suffix}`,'Bob','hash');
    const session=await repo.createSession(alice.id,'11'.repeat(32));assert.equal((await repo.findSession('11'.repeat(32)))?.id,session.id);
    const conversation=await repo.createDirectConversation(alice.id,bob.id);assert.equal(await repo.isMember(conversation.id,alice.id),true);
    const first=await repo.appendMessage(conversation.id,alice.id,'bonjour','00000000-0000-4000-8000-000000000001');const retry=await repo.appendMessage(conversation.id,alice.id,'bonjour','00000000-0000-4000-8000-000000000001');
    assert.equal(first.created,true);assert.equal(retry.created,false);assert.equal(retry.message.id,first.message.id);assert.equal((await repo.listMessages(conversation.id)).length,1);
    await repo.revokeSession(session.id);assert.equal(await repo.findSession('11'.repeat(32)),undefined);
  }finally{await repo.close()}
});
