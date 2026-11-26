/** Publication des images, avec une doublure de docker. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const registry='registre.test/chatisen';
const digest=`${registry}/api@sha256:${'d'.repeat(64)}`;
const fake=`#!/usr/bin/env node
const fs=require('fs');const args=process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG,args.join(' ')+'\\n');
if(args[0]==='pull'&&!process.env.FAKE_EXISTS)process.exit(1);
if(args[0]==='inspect')process.stdout.write('${digest}\\n');
if(args[0]==='build')process.stdout.write('sortie de construction\\n');
`;

function publish(environment={}){
  const directory=mkdtempSync(join(tmpdir(),'chatisen-publication-'));
  try{
    const log=join(directory,'appels');writeFileSync(log,'');
    writeFileSync(join(directory,'docker'),fake);chmodSync(join(directory,'docker'),0o755);
    const result=spawnSync('bash',[resolve('infra/gcp/cd/publish.sh'),'api','apps/api/Dockerfile'],{encoding:'utf8',timeout:30_000,
      env:{...process.env,PATH:`${directory}:${process.env.PATH}`,FAKE_LOG:log,REGISTRY:registry,RELEASE:'abc123',...environment}});
    return {...result,calls:readFileSync(log,'utf8').trim().split('\n')};
  }finally{rmSync(directory,{recursive:true,force:true});}
}
const tagOf=run=>run.calls[0].split(' ').at(-1);

test('image publication: new sources are built and pushed, only the digest is printed',()=>{
  const run=publish();
  assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,`${digest}\n`);
  assert.match(tagOf(run),new RegExp(`^${registry}/api:src-[0-9a-f]{40}$`));
  assert.ok(run.calls.some(call=>call.startsWith('build ')));assert.ok(run.calls.includes(`push --quiet ${tagOf(run)}`));
});

test('image publication: unchanged sources reuse the image, so the same digest is deployed',()=>{
  const run=publish({FAKE_EXISTS:'1'});
  assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,`${digest}\n`);
  assert.ok(!run.calls.some(call=>call.startsWith('build ')));
  assert.ok(run.calls.includes(`push --quiet ${registry}/api:abc123`));
  assert.equal(tagOf(run),tagOf(publish({FAKE_EXISTS:'1',RELEASE:'def456'})),'the tag depends on the sources, not on the commit');
});

test('image publication: a rebuild can be forced',()=>{
  const run=publish({FAKE_EXISTS:'1',CHATISEN_REBUILD:'1'});
  assert.ok(run.calls.some(call=>call.startsWith('build ')));assert.ok(!run.calls.some(call=>call.startsWith('pull ')));
});
