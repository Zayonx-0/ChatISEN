/** Déploiement continu de la cible, avec une doublure de gcloud et de curl. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const registry='europe-west4-docker.pkg.dev/project-fd23d3d9-a7e8-4002-a7a/chatisen';
const image=(name,letter)=>`${registry}/${name}@sha256:${letter.repeat(64)}`;
const fake=`#!/usr/bin/env node
const fs=require('fs');const file=process.env.FAKE_STATE;const state=JSON.parse(fs.readFileSync(file));
const args=process.argv.slice(2),line=args.join(' ');const save=()=>fs.writeFileSync(file,JSON.stringify(state));
const out=value=>process.stdout.write(JSON.stringify(value));
const items=m=>Object.entries(m).map(([key,value])=>({key,value}));
const running=()=>state.override??state.template;
if(process.argv[1].endsWith('curl')){process.exit(running()['api-image']===state.broken?22:0);}
state.calls.push(line);save();
if(line.includes('all-instances-config update')&&state.refused){process.stderr.write("Required 'compute.healthChecks.use' permission\\n");process.exit(1);}
else if(line.includes('all-instances-config update')){state.override=Object.fromEntries(args[args.indexOf('--metadata')+1].split(',').map(p=>p.split(/=(.*)/s).slice(0,2)));save();}
else if(line.includes('managed describe'))out({allInstancesConfig:state.override?{properties:{metadata:state.override}}:undefined,versions:[{instanceTemplate:'x/templates/modele'}],status:{isStable:true,versionTarget:{isReached:true},allInstancesConfig:{effective:true}}});
else if(line.includes('instance-templates describe'))out({properties:{metadata:{items:items(state.template)}}});
else if(line.includes('instances list --filter'))out([1,2].map(()=>({status:'RUNNING',metadata:{items:items(running())}})));
else if(line.includes('list-instances'))out([1,2].map(()=>({currentAction:'NONE',instanceHealth:[{detailedHealthState:'HEALTHY'}]})));
else if(line.includes('jobs execute')&&state.migrationFails)process.exit(1);
`;

function scenario({broken,migrationFails,refused,api=image('api','b'),edge=image('edge','b')}={}){
  const directory=mkdtempSync(join(tmpdir(),'chatisen-cd-'));
  try{
    const stateFile=join(directory,'state.json');
    writeFileSync(stateFile,JSON.stringify({calls:[],broken,migrationFails,refused,template:{'api-image':image('api','a'),'edge-image':image('edge','a')}}));
    for(const name of ['gcloud','curl']){writeFileSync(join(directory,name),fake);chmodSync(join(directory,name),0o755);}
    const result=spawnSync('bash',[resolve('infra/gcp/cd/deploy.sh'),api,edge],{encoding:'utf8',timeout:60_000,
      env:{...process.env,PATH:`${directory}:${process.env.PATH}`,FAKE_STATE:stateFile,CHATISEN_ROLL_TIMEOUT:'3',CHATISEN_ROLL_POLL:'0'}});
    return {...result,state:JSON.parse(readFileSync(stateFile,'utf8'))};
  }finally{rmSync(directory,{recursive:true,force:true});}
}

test('target CD: migrates first, then replaces the VMs and verifies them',()=>{
  const run=scenario();
  assert.equal(run.status,0,run.stdout+run.stderr);
  const at=text=>run.state.calls.findIndex(call=>call.includes(text));
  assert.ok(at('jobs execute')>=0&&at('jobs execute')<at('all-instances-config update'));
  assert.equal(run.state.override['api-image'],image('api','b'));
});

test('target CD: an unhealthy release is rolled back to the previous images',()=>{
  const run=scenario({broken:image('api','b')});
  assert.equal(run.status,1);assert.match(run.stderr,/Retour arrière vérifié/);
  assert.deepEqual(run.state.override,{'api-image':image('api','a'),'edge-image':image('edge','a')});
});

test('target CD: a refused group update fails at once, without a fake rollback',()=>{
  const run=scenario({refused:true});
  assert.equal(run.status,1);
  assert.match(run.stderr,/compute\.healthChecks\.use/,'the reason given by Google Cloud is shown');
  assert.match(run.stderr,/aucune VM n’a été touchée/);
  assert.doesNotMatch(run.stdout+run.stderr,/Retour arrière/);
  assert.equal(run.state.calls.filter(call=>call.includes('all-instances-config update')).length,1,'no second attempt');
});

test('target CD: a failed migration leaves the VMs untouched',()=>{
  const run=scenario({migrationFails:true});
  assert.notEqual(run.status,0);assert.equal(run.state.override,undefined);
});

test('target CD: only digests from the project registry are accepted',()=>{
  for(const api of [`${registry}/api:latest`,`evil.test/api@sha256:${'c'.repeat(64)}`,image('edge','c')]){
    const run=scenario({api});
    assert.equal(run.status,2,api);assert.deepEqual(run.state.calls,[]);
  }
});
