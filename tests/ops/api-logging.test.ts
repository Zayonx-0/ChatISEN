import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Writable} from 'node:stream';
import {parse} from 'yaml';
import {useApiErrors} from '../../apps/api/src/platform/http.js';
import {serializeError} from '../../apps/api/src/platform/logging.js';

const fastify=createRequire(new URL('../../apps/api/package.json',import.meta.url))('fastify');
const parser=new RegExp(parse(readFileSync('infra/gcp/vm/ops-agent.yaml','utf8')).logging.processors.fields.regex);

test('Les journaux HTTP conservent le diagnostic et masquent les données sensibles',async()=>{
  let output='';
  const app=fastify({disableRequestLogging:true,requestIdLogLabel:'requestId',logger:{
    serializers:{err:serializeError},
    stream:new Writable({write(chunk,_encoding,done){output+=chunk.toString();done();}}),
  }});
  useApiErrors(app);
  const values=['motdepasse-test','priv.example','objet-signe','signature-jetable','query-value','jeton-cache','cookie-cache',
    '192.0.2.54','detail-confidentiel','parametre-confidentiel','corps-confidentiel','cookie-suivant','eyJabc.def.ghi'];
  const cause=Object.assign(new Error(
    'Connexion refusée postgres://app:motdepasse-test@priv.example:5432/app '+
    'https://storage.test/objet-signe?X-Goog-Signature=signature-jetable /api?secret=query-value '+
    'access_token=jeton-cache 192.0.2.54 eyJabc.def.ghi Cookie: cookie-cache; session=cookie-suivant'
  ),{code:'ECONNREFUSED',detail:values[8],parameters:[values[9]],body:values[10]});
  app.get('/',()=>{throw cause;});
  try{
    const response=await app.inject('/');
    assert.equal(response.statusCode,500);
    const record=output.trim().split('\n').map(line=>JSON.parse(line)).find(row=>row.err);
    assert.equal(record.requestId,response.json().requestId);
    assert.equal(record.err.type,'Error');
    assert.equal(record.err.code,'ECONNREFUSED');
    assert.match(record.err.message,/^Connexion refusée/);
    assert.match(record.err.stack,/^    at .*api-logging\.test\.ts:/m);
    assert.ok(record.err.message.length<=240);
    for(const value of values)assert.ok(!output.includes(value),value);
    const fields=parser.exec(JSON.stringify(record))?.groups;
    assert.equal(fields?.errorCode,'ECONNREFUSED');
    assert.equal(fields?.errorMessage,record.err.message);
    assert.match(fields?.errorStack??'',/api-logging\.test\.ts/);
  }finally{await app.close();}
});

test('Un échec réel au démarrage conserve la variable obligatoire et les cadres utiles',()=>{
  const env={...process.env,NODE_ENV:'production'};
  delete (env as NodeJS.ProcessEnv).DATABASE_URL;
  const result=spawnSync(process.execPath,['--import','tsx','apps/api/src/server.ts'],{env,encoding:'utf8',timeout:10_000});
  assert.equal(result.status,1,result.stderr);
  const record=JSON.parse(result.stderr.trim());
  assert.equal(record.err.message,'DATABASE_URL est obligatoire');
  assert.match(record.err.stack,/    at required \(src\/server\.ts:/);
  assert.equal(parser.exec(result.stderr)?.groups?.errorMessage,record.err.message);
});
