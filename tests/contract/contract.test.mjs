import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from '../../packages/contracts/schemas/http.json' with { type: 'json' };
import ws from '../../packages/contracts/schemas/ws.json' with { type: 'json' };
import openapi from '../../packages/contracts/schemas/openapi.json' with { type: 'json' };
import { applyMigrations, migrationFiles } from '../../db/migrate.mjs';
import { validate, schemaAt } from './validator.mjs';
import {openapi as target,asyncapi,checkReferences,operations} from './architecture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, '../..');
const fixture = async (name) => JSON.parse(await readFile(join(project, 'fixtures', name), 'utf8'));

test('contrats de la cible : références et opérations',()=>{
  checkReferences(target);checkReferences(asyncapi);
  assert.equal(operations.length,new Set(operations.map(({operation})=>operation.operationId)).size);
  for(const {operation} of operations){
    if(operation.security?.length!==0)assert.ok(Object.hasOwn(operation.responses,'401'),operation.operationId);
    assert.ok(Object.keys(operation.responses).some(status=>/^2\d\d$/.test(status)),operation.operationId);
  }
});

test('contrats de la cible : aucune description coupée par une virgule',()=>{
  // En notation compacte YAML, une virgule hors guillemets ouvre un champ sans valeur.
  const orphans=(node,path)=>node&&typeof node==='object'?Object.entries(node).flatMap(([key,value])=>
    value===null&&!Array.isArray(node)&&!['const','default','example'].includes(key)?[`${path}/${key}`]:orphans(value,`${path}/${key}`)):[];
  assert.deepEqual([...orphans(target,'openapi'),...orphans(asyncapi,'asyncapi')],[]);
});

test('document OpenAPI 3.1 conforme au schéma officiel',async t=>{
  if(!process.env.OPENAPI_META_SCHEMA)return t.skip('OPENAPI_META_SCHEMA absent');
  // AJV résout mal « $dynamicRef: #meta » et exigerait un paramètre à la place d'un schéma.
  // Hors dialecte particulier, cette référence désigne $defs/schema.
  const meta=JSON.parse(await readFile(process.env.OPENAPI_META_SCHEMA,'utf8'),
    (_key,value)=>value?.$dynamicRef==='#meta'?{$ref:'#/$defs/schema'}:value);
  const ajv=addFormats(new Ajv2020({strict:false,allErrors:true}));
  assert.ok(ajv.validate(meta,target),ajv.errorsText(ajv.errors));
});

test('HTTP schemas validate success and error fixtures', async () => {
  const good = await fixture('contract-success.json');
  const errors = await fixture('contract-errors.json');
  validate(good.profile, schemaAt(http, '#/$defs/UserProfile'), http);
  validate(good.message, schemaAt(http, '#/$defs/Message'), http);
  validate(good.call, schemaAt(http, '#/$defs/CallSummary'), http);
  validate(good.qualityBatch, schemaAt(http, '#/$defs/QualityBatchRequest'), http);
  validate({ clientId: good.message.clientId, file: 'fixture-bytes' }, schemaAt(http, '#/$defs/FileUploadRequest'), http);
  for (const error of errors) validate(error, schemaAt(http, '#/$defs/ApiError'), http);
});

test('WS envelopes validate in both directions', async () => {
  const good = await fixture('contract-success.json');
  validate(good.wsSubscribe, schemaAt(ws, '#/$defs/ClientEnvelope'), ws);
  validate(good.wsReady, schemaAt(ws, '#/$defs/ServerEnvelope'), ws);
  validate(good.event, schemaAt(ws, '#/$defs/Event'), ws);
  assert.throws(() => validate({ v: 1, type: 'subscribe', conversationId: good.message.conversationId, afterSeq: '-1' }, schemaAt(ws, '#/$defs/ClientEnvelope'), ws));
});

test('schema rejects incompatible payloads before UI integration', async () => {
  const good = await fixture('contract-success.json');
  assert.throws(() => validate({ handle: 'A!', displayName: 'Alice', password: 'short' }, schemaAt(http, '#/$defs/RegisterRequest'), http));
  assert.throws(() => validate({ clientId: good.message.clientId, text: '   ' }, schemaAt(http, '#/$defs/CreateMessageRequest'), http));
  assert.throws(() => validate({ ...good.message, attachment: { id: good.message.id, fileName: 'x.txt', mediaType: 'text/plain', size: 1, sha256: '0'.repeat(64) } }, schemaAt(http, '#/$defs/Message'), http));
  assert.throws(() => validate({ ...good.qualityBatch, samples: [] }, schemaAt(http, '#/$defs/QualityBatchRequest'), http));
});

test('catalogue covers the frozen HTTP and WS surface', () => {
  const paths = new Set(http.routes.map((route) => `${route.method} ${route.path.split('?')[0]}`));
  for (const required of [
    'POST /auth/register', 'POST /auth/login', 'POST /auth/logout', 'GET /me', 'PATCH /me',
    'GET /conversations', 'POST /conversations/direct', 'POST /conversations/groups',
    'GET /conversations/{id}/messages', 'POST /conversations/{id}/messages',
    'GET /conversations/{id}/events', 'POST /conversations/{id}/files', 'GET /files/{id}',
    'POST /conversations/{id}/calls', 'POST /calls/{id}/join', 'POST /calls/{id}/quality'
  ]) assert.ok(paths.has(required), `missing ${required}`);
  assert.equal(http.routes.filter((route) => route.method === 'POST' && route.success.status === 201).length >= 4, true);
  assert.deepEqual(ws.$defs.ServerType.enum, ['ready', 'subscribed', 'event', 'conversation_list_changed', 'resync_required', 'error', 'pong']);
  assert.equal(openapi.openapi, '3.1.0');
  assert.ok(openapi.paths['/ws'].get['x-websocket']);
  assert.ok(Object.keys(openapi.paths).length >= 24);
});

test('runtime package exports the same frozen version and type lists', async () => {
  const runtime = await import('../../packages/contracts/src/index.mjs');
  assert.equal(runtime.CONTRACT_VERSION, 1);
  assert.ok(runtime.ERROR_CODES.includes('NOT_MEMBER'));
  assert.deepEqual(runtime.WS_SERVER_TYPES, ws.$defs.ServerType.enum);
  assert.equal(runtime.apiPath('/me'), '/api/v1/me');
});

test('fixtures contain the four deterministic demo identities', async () => {
  const users = await fixture('users.json');
  assert.equal(users.length, 4);
  assert.deepEqual(users.map((user) => user.handle), ['alice', 'bob', 'chloe', 'eve']);
  for (const user of users) validate(user, schemaAt(http, '#/$defs/UserPublic'), http);
});

test('migration files are ordered and guarded for idempotent application', async () => {
  const files = await migrationFiles();
  assert.deepEqual(files, ['001_initial.sql', '002_group_commands.sql', '003_calls_p2p_push.sql', '004_module_schemas.sql', '005_call_transport.sql', '006_file_attachment.sql', '007_operations.sql']);
  const sql = await readFile(join(project, 'db/migrations/001_initial.sql'), 'utf8');
  for (const table of ['users', 'sessions', 'conversations', 'conversation_members', 'conversation_events', 'messages', 'attachments', 'calls', 'call_participants', 'media_jobs', 'webhook_receipts', 'quality_samples']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_pair_idx/);
  assert.match(sql, /pg_notify\('chatisen_conversation_events'/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS _chatisen_migrations/);
});

test('migration runner executes two passes when DATABASE_URL is provided', async (t) => {
  if (!process.env.DATABASE_URL) return t.skip('DATABASE_URL not set; static migration checks still ran');
  let pg;
  try { pg = await import('pg'); } catch { return t.skip('pg package not installed'); }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const first = await applyMigrations(client);
    const second = await applyMigrations(client);
    assert.ok([...first.applied, ...first.alreadyApplied].includes('001_initial.sql'), 'initial migration must be recorded');
    assert.equal((await client.query("select to_regclass('identity.users') as table_name")).rows[0].table_name, 'identity.users');
    const crossing = await client.query(`select count(*)::int as n from pg_constraint c join pg_class s on s.oid=c.conrelid join pg_class t on t.oid=c.confrelid
      where c.contype='f' and s.relnamespace<>t.relnamespace`);
    assert.equal(crossing.rows[0].n, 0, 'no foreign key crosses two module schemas');
    assert.equal(second.applied.length, 0);
  } finally { await client.end(); }
});
