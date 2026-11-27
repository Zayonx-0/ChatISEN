import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {applyMigrations} from '../../../db/migrate.mjs';
import {startApp} from '../helpers.js';

test('SQL : un propriétaire sans SUPERUSER prépare le rôle API et lui accorde la lecture de toutes les tables',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL non défini');
  const url=new URL(process.env.DATABASE_URL),socket=url.searchParams.get('host');
  assert.match(url.pathname,/^\/[a-z0-9_]+_test$/);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname)||socket?.startsWith('/'),'Base de test locale requise');
  const suffix=randomBytes(6).toString('hex'),ownerName='owner_'+suffix,database='api_'+suffix+'_test';
  const ownerPassword=randomBytes(16).toString('hex'),password="b2'-$"+randomBytes(16).toString('hex');
  const program=await readFile(new URL('../../../db/ops/prepare-api-role.mjs',import.meta.url),'utf8');
  const grants=await readFile(new URL('../../../db/ops/api-grants.sql',import.meta.url),'utf8');
  const admin=new Client({connectionString:url.href});
  await admin.connect();
  try{
    assert.equal((await admin.query("SELECT FROM pg_roles WHERE rolname IN ('chatisen_api','cloudsqlsuperuser')")).rowCount,0,'Cluster jetable requis');
    await admin.query(`CREATE ROLE cloudsqlsuperuser CREATEROLE; CREATE ROLE ${ownerName} LOGIN PASSWORD '${ownerPassword}'`);
    try{
      await admin.query(`GRANT cloudsqlsuperuser TO ${ownerName} WITH INHERIT FALSE, SET TRUE`);
      await admin.query(`CREATE DATABASE ${database} OWNER ${ownerName}`);
      try{
        url.pathname=database;url.username=ownerName;url.password=ownerPassword;
        const owner=new Client({connectionString:url.href});
        await owner.connect();
        try{
          assert.deepEqual((await owner.query('SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows,[{rolsuper:false,rolcreaterole:false}]);
          await applyMigrations(owner);
          for(const secret of [randomBytes(16).toString('hex'),password]){
            const run=spawnSync(process.execPath,['--input-type=module'],{
              input:program,encoding:'utf8',timeout:30_000,
              env:{...process.env,DATABASE_URL:url.href,API_ROLE_GRANTS_SQL:grants,API_ROLE_PASSWORD:secret},
            });
            const output=run.stdout+run.stderr;
            assert.ok(!output.includes(secret)&&!output.includes('SCRAM-SHA-256'),'La préparation ne publie aucun secret');
            assert.equal(run.status,0,output);
          }

          const tables=(await owner.query(`SELECT format('%I.%I',nspname,relname) AS name
            FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace
            WHERE relkind IN ('r','p','f') AND nspname IN ('identity','groups','messaging','files','calls','quality','notifications','realtime')
            ORDER BY 1`)).rows;
          assert.ok(tables.length>0);
          url.username='chatisen_api';url.password=password;
          const restricted=new Client({connectionString:url.href});
          await restricted.connect();
          try{
            for(const {name} of tables){
              await assert.doesNotReject(restricted.query(`SELECT * FROM ${name} LIMIT 0`),`Lecture API requise sur ${name}`);
            }
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
        }finally{await owner.end();}
      }finally{
        await admin.query(`DROP DATABASE ${database}`);
        await admin.query('DROP ROLE IF EXISTS chatisen_api');
      }
    }finally{await admin.query(`DROP ROLE ${ownerName}; DROP ROLE cloudsqlsuperuser`);}
  }finally{await admin.end();}
});
