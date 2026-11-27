import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {applyMigrations} from '../../../db/migrate.mjs';
import {startApp} from '../helpers.js';

test('SQL : l’API lit et écrit avec son rôle, sans pouvoir modifier le schéma',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL non défini');
  const url=new URL(process.env.DATABASE_URL),socket=url.searchParams.get('host');
  const database=url.pathname.slice(1);
  assert.match(database,/^[a-z0-9_]+_test$/);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname)||socket?.startsWith('/'),'Base de test locale requise');
  const role='chatisen_api_'+randomBytes(6).toString('hex'),password=randomBytes(16).toString('hex');
  const owner=new Client({connectionString:url.href});
  await owner.connect();
  try{
    await applyMigrations(owner);
    await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
    try{
      const grants=await readFile(new URL('../../../db/ops/api-grants.sql',import.meta.url),'utf8');
      try{await owner.query(grants.replaceAll('chatisen_api',role).replace('ON DATABASE chatisen','ON DATABASE '+database));}
      catch(error){await owner.query('ROLLBACK');throw error;}
      url.username=role;url.password=password;
      const restricted=new Client({connectionString:url.href});
      await restricted.connect();
      try{
        const h=await startApp({databaseUrl:url.href});
        try{
          const alice=await h.register('alice'),bob=await h.register('bob');
          const logged=await h.login(alice),conversation=await h.direct(logged,bob);
          const path=`/conversations/${conversation}/messages`;
          const sent=await h.call(logged,'POST',path,{text:'message de test',clientId:randomUUID()});
          assert.equal(sent.statusCode,201,sent.body);
          const received=await h.call(bob,'GET',path);
          assert.equal(received.statusCode,200,received.body);
          assert.equal(received.json().items[0].text,'message de test');
        }finally{await h.close();}
        for(const sql of ['CREATE SCHEMA extra','CREATE TABLE public.extra(id int)','ALTER TABLE messaging.messages ADD COLUMN extra int',
          'DELETE FROM identity.users WHERE false','SELECT * FROM public._chatisen_migrations']){
          await assert.rejects(restricted.query(sql),{code:'42501'});
        }
      }finally{await restricted.end();}
    }finally{
      await owner.query(`DROP OWNED BY ${role}`);
      await owner.query(`DROP ROLE ${role}`);
    }
  }finally{await owner.end();}
});
