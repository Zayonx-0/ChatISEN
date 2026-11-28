import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const registry='europe-west4-docker.pkg.dev/project-fd23d3d9-a7e8-4002-a7a/chatisen';
const image=(name,letter)=>`${registry}/${name}@sha256:${letter.repeat(64)}`;
const pair=letter=>({'api-image':image('api',letter),'edge-image':image('edge',letter)});
const fake=`#!/usr/bin/env node
const fs=require('node:fs'),args=process.argv.slice(2),line=args.join(' ');
const file=process.env.FAKE_STATE,state=JSON.parse(fs.readFileSync(file));
const save=()=>fs.writeFileSync(file,JSON.stringify(state));
const out=value=>process.stdout.write(JSON.stringify(value));
if(process.argv[1].endsWith('curl'))process.exit(Object.values(state.vms).some(vm=>vm.healthy)?0:22);
state.calls.push(line);save();
if(line.includes('managed describe'))out({
  targetSize:2,updatePolicy:{type:'OPPORTUNISTIC'},versions:[{instanceTemplate:'x/templates/modele'}],
  allInstancesConfig:{properties:{metadata:state.desired}}
});
else if(line.includes('list-instances'))out(Object.entries(state.vms).map(([zone,vm])=>({
  instance:'x/zones/europe-west4-'+zone+'/instances/app-'+zone,currentAction:'NONE',instanceStatus:'RUNNING',
  instanceHealth:[{detailedHealthState:vm.healthy?'HEALTHY':'UNHEALTHY'}],version:{instanceTemplate:'x/templates/modele'}
})));
else if(line.includes('get-guest-attributes')){
  const vm=state.vms[args[3].at(-1)];
  if(vm.uninstrumented)process.exit(1);
  out([{key:'release',value:JSON.stringify({api:vm.images['api-image'],edge:vm.images['edge-image'],ready:vm.healthy,boot:String(vm.boot),time:Math.floor(Date.now()/1000)})}]);
}
else if(line.includes('backend-services get-health')){
  if(state.lbDenied){process.stderr.write("Required 'compute.regionBackendServices.get' permission\\n");process.exit(1);}
  out([{status:{healthStatus:Object.entries(state.vms).map(([zone,vm])=>({
    instance:'x/zones/europe-west4-'+zone+'/instances/app-'+zone,healthState:vm.healthy&&!(vm.lbWait>0)?'HEALTHY':'UNHEALTHY'
  }))}}]);
  for(const vm of Object.values(state.vms))if(vm.lbWait>0)vm.lbWait--;
  save();
}
else if(line.includes('all-instances-config update')){
  if(state.refused){process.stderr.write("Required 'compute.healthChecks.use' permission\\n");process.exit(1);}
  state.desired=Object.fromEntries(args.find(a=>a.startsWith('--metadata=')).slice(11).split(',').map(p=>p.split('=')));
  save();
}
else if(line.includes('update-instances')){
  const zone=args.find(a=>a.startsWith('--instances=')).at(-1),vm=state.vms[zone],newRelease=state.desired['api-image']!==state.old['api-image'];
  if(!Object.entries(state.vms).some(([key,peer])=>key!==zone&&peer.healthy))process.exit(7);
  // Personne n'est servi si l'aiguilleur n'a pas encore repris l'autre VM.
  if(!Object.entries(state.vms).some(([key,peer])=>key!==zone&&peer.healthy&&!(peer.lbWait>0)))state.outage=true;
  state.restarts.push(zone);
  vm.boot++;vm.healthy=!(newRelease&&state.unhealthy===zone);
  vm.images=newRelease&&state.different===zone?state.old:state.desired;
  vm.lbWait=newRelease&&state.lbRefuses===zone?1e9:state.lbLag||0;
  delete vm.uninstrumented;
  save();
}
else if(line.includes('jobs execute')&&state.migrationFails)process.exit(1);
`;

function scenario({api=image('api','b'),edge=image('edge','b'),bootstrap=false,...faults}={}){
  const directory=mkdtempSync(join(tmpdir(),'chatisen-cd-'));
  try{
    const file=join(directory,'state.json'),vm={images:pair('a'),healthy:true,boot:1,uninstrumented:bootstrap};
    writeFileSync(file,JSON.stringify({calls:[],restarts:[],old:pair('a'),desired:pair('a'),vms:{a:vm,b:vm},...faults}));
    for(const name of ['gcloud','curl']){
      const path=join(directory,name);writeFileSync(path,fake);chmodSync(path,0o755);
    }
    const result=spawnSync('bash',[resolve('infra/gcp/cd/deploy.sh'),...(bootstrap?['--bootstrap']:[api,edge])],{
      encoding:'utf8',timeout:60_000,
      env:{...process.env,PATH:`${directory}:${process.env.PATH}`,FAKE_STATE:file,CHATISEN_ROLL_TIMEOUT:'2',CHATISEN_ROLL_POLL:'0',CHATISEN_LB_STABLE:'0'},
    });
    return {...result,state:JSON.parse(readFileSync(file,'utf8'))};
  }finally{rmSync(directory,{recursive:true,force:true});}
}

test('CD cible : migration, APP-A, APP-B et digests actifs',()=>{
  const run=scenario();
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.deepEqual(run.state.restarts,['a','b']);
  const at=text=>run.state.calls.findIndex(call=>call.includes(text));
  assert.ok(at('jobs execute')>=0&&at('jobs execute')<at('all-instances-config update'));
  for(const vm of Object.values(run.state.vms))assert.deepEqual(vm.images,pair('b'));
});

test('CD cible : amorçage avec les digests actuels et des VM sans guest attributes',()=>{
  const run=scenario({bootstrap:true});
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.deepEqual(run.state.restarts,['a','b']);
  assert.ok(!run.state.calls.some(call=>call.includes('jobs execute')||call.includes('all-instances-config update')));
});

test('CD cible : échec du canari, APP-B reste intacte',()=>{
  const run=scenario({unhealthy:'a'});
  assert.equal(run.status,1);
  assert.match(run.stderr,/Retour arrière vérifié/);
  assert.deepEqual(run.state.restarts,['a','a']);
  assert.equal(run.state.vms.b.boot,1);
  assert.deepEqual(run.state.vms.a.images,pair('a'));
});

test('CD cible : échec de APP-B, retour de B puis de A',()=>{
  const run=scenario({unhealthy:'b'});
  assert.equal(run.status,1);
  assert.match(run.stderr,/Retour arrière vérifié/);
  assert.deepEqual(run.state.restarts,['a','b','b','a']);
  for(const vm of Object.values(run.state.vms))assert.deepEqual(vm.images,pair('a'));
});

test('CD cible : un digest actif différent est refusé même si la VM est saine',()=>{
  const run=scenario({different:'a'});
  assert.equal(run.status,1);
  assert.match(run.stderr,/Retour arrière vérifié/);
  assert.equal(run.state.vms.b.boot,1);
  assert.deepEqual(run.state.restarts,['a','a']);
  assert.deepEqual(run.state.desired,pair('a'));
});

test('CD cible : refus de mise à jour, aucune VM touchée',()=>{
  const run=scenario({refused:true});
  assert.equal(run.status,1);
  assert.match(run.stderr,/compute\.healthChecks\.use/);
  assert.match(run.stderr,/aucune VM n’a été touchée/);
  assert.deepEqual(run.state.restarts,[]);
  assert.equal(run.state.calls.filter(call=>call.includes('all-instances-config update')).length,1);
});

test('CD cible : APP-B attend que l’aiguilleur ait repris APP-A',()=>{
  const run=scenario({lbLag:6});
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.deepEqual(run.state.restarts,['a','b']);
  assert.ok(!run.state.outage,'les deux VM ne doivent jamais être hors service en même temps');
});

test('CD cible : une VM saine que l’aiguilleur ne reprend pas laisse l’autre intacte',()=>{
  const run=scenario({lbRefuses:'a'});
  assert.equal(run.status,1);
  assert.match(run.stderr,/Retour arrière vérifié/);
  assert.equal(run.state.vms.b.boot,1);
  assert.ok(!run.state.outage);
});

test('CD cible : état de l’aiguilleur illisible, rien n’est modifié',()=>{
  const run=scenario({lbDenied:true});
  assert.equal(run.status,1);
  assert.deepEqual(run.state.restarts,[]);
  assert.ok(!run.state.calls.some(call=>call.includes('jobs execute')||call.includes('all-instances-config update')));
});

test('CD cible : échec de migration, aucune VM touchée',()=>{
  const run=scenario({migrationFails:true});
  assert.notEqual(run.status,0);
  assert.deepEqual(run.state.restarts,[]);
  assert.ok(!run.state.calls.some(call=>call.includes('all-instances-config update')));
});

test('CD cible : seuls les digests du registre du projet sont acceptés',()=>{
  for(const api of [`${registry}/api:latest`,`other.test/api@sha256:${'c'.repeat(64)}`,image('edge','c')]){
    const run=scenario({api});
    assert.equal(run.status,2,api);
    assert.deepEqual(run.state.calls,[]);
  }
});
