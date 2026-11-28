import test from 'node:test';
import assert from 'node:assert/strict';
import {password,startApp} from '../helpers.js';
import type {AppOptions} from '../../../apps/api/src/app.js';

test('lot D : droits, vérifications, verrou inter-réplicas et audit',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL non définie');
  assert.match(new URL(process.env.DATABASE_URL).pathname,/_test$/,'Base jetable requise');
  type Options=NonNullable<AppOptions['operations']>;
  const appA={name:'chatisen-app-test-a',zone:'test-a'},appB={name:'chatisen-app-test-b',zone:'test-b'};
  const sfu1={name:'chatisen-sfu-1',zone:'test-a'},sfu2={name:'chatisen-sfu-2',zone:'test-b'};
  let peerHealth:'healthy'|'down'|'unknown'='healthy',observedBoot=Math.floor(Date.now()/1000)-3600;
  let press=0,release:()=>void=()=>{},entered:()=>void=()=>{};
  const dispatched=new Promise<void>(resolve=>{entered=resolve;});
  let cloudResult:'accepted'|'rejected'|'unknown'='accepted';
  const options:Options={
    restartsEnabled:true,inventory:{'app-a':appA,'app-b':appB,'sfu-1':sfu1,'sfu-2':sfu2},
    monitoring:{
      health:async()=>({
        'app-a':{health:'healthy',boot:observedBoot,digests:{api:'sha256:'+'a'.repeat(64),edge:null}},
        'app-b':{health:peerHealth,boot:observedBoot,digests:null},
        'sfu-1':{health:'healthy',boot:observedBoot,digests:null},'sfu-2':{health:'down',boot:observedBoot,digests:null},
      }),
      alerts:async()=>{throw new Error('source de test');},
      metrics:async()=>({httpRequests:[1,2,null,3]}),resources:async()=>({}),
    },
    cloud:{
      isRunning:async()=>true,lastBackup:async()=>new Date(0).toISOString(),
      reset:async(vm,id)=>{
        assert.equal(vm.name,appA.name);assert.match(id,/^[a-f0-9-]{36}$/);
        press++;if(press===1)await new Promise<void>(resolve=>{release=resolve;entered();});return cloudResult;
      },
    },
    certificates:{expiry:async endpoint=>endpoint==='coturn'?null:new Date(Date.now()+10*86400000).toISOString()},
  };
  const h=await startApp({background:false,operations:options});
  const h2=await startApp({background:false,operations:options});
  const hOff=await startApp({background:false,operations:{...options,restartsEnabled:undefined}});
  const otherAdmins:string[]=[];
  try{
    const admin=await h.register('lotd_admin'),user=await h.register('lotd_user'),next=await h.register('lotd_peer');
    await h.pool.query("update identity.users set global_role='admin' where id=$1",[admin.id]);
    const request={target:'app-a',confirmation:appA.name,password};
    for(const [method,url,body] of [
      ['GET','/admin/overview'],['GET','/admin/users'],['GET','/audit-events'],
      ['PATCH',`/users/${next.id}`,{disabled:true}],['POST','/admin/restarts',request],
    ] as const)assert.equal((await h.call(user,method,url,body)).statusCode,403,url);

    const overview=await h.call(admin,'GET','/admin/overview');
    assert.equal(overview.statusCode,200,overview.body);
    const view=overview.json();
    assert.equal(view.database,'healthy');assert.equal(view.alerts,null);assert.equal(view.servers.length,6);
    assert.deepEqual(view.metrics.httpRequests,[1,2,null,3]);assert.equal(view.activity.dailyMessages.length,7);
    assert.equal(view.lastBackup,new Date(0).toISOString());assert.equal(view.tls[0].expiring,true);assert.equal(view.tls[1].expiresAt,null);
    assert.equal(view.servers[0].confirmationName,appA.name);
    assert.ok(!overview.body.includes('"zone"')&&!overview.body.includes('"boot"')&&!overview.body.includes('"vmName"'));

    const page=await h.call(admin,'GET',`/admin/users?q=${h.suffix}&limit=1`);
    assert.equal(page.statusCode,200,page.body);assert.equal(page.json().items[0].id,admin.id);
    const following=await h.call(admin,'GET',`/admin/users?q=${h.suffix}&limit=1&cursor=${page.json().nextCursor}`);
    assert.equal(following.json().items[0].id,next.id);
    const extra=await h.login(user);
    assert.equal((await h.call(admin,'PATCH',`/users/${user.id}`,{revokeSessions:true})).statusCode,200);
    for(const session of [user,extra])assert.equal((await h.call(session,'GET','/users/me')).statusCode,401);
    assert.equal((await h.call(admin,'PATCH',`/users/${user.id}`,{disabled:true})).statusCode,200);
    const disabled=(await h.call(admin,'GET',`/admin/users?q=${user.handle}`)).json().items[0];
    assert.equal(disabled.disabled,true);assert.equal(disabled.activeSessions,0);
    assert.equal((await h.call(admin,'PATCH',`/users/${user.id}`,{disabled:false})).statusCode,200);
    const demoted=await h.pool.query("update identity.users set global_role='user' where global_role='admin' and id<>$1 returning id",[admin.id]);
    otherAdmins.push(...demoted.rows.map(row=>row.id));
    const mutate=(who:typeof admin,id:string,body:object)=>h.call(who,'PATCH',`/users/${id}`,body);
    const refusal=await mutate(admin,admin.id,{globalRole:'user'});
    assert.equal(refusal.statusCode,409);assert.equal(refusal.json().code,'LAST_ADMIN');
    assert.equal((await mutate(admin,admin.id,{disabled:true})).json().code,'LAST_ADMIN');
    assert.equal((await mutate(admin,next.id,{globalRole:'admin'})).statusCode,200);
    assert.equal((await mutate(admin,admin.id,{disabled:true})).json().code,'SELF_ADMINISTRATION');
    assert.equal((await mutate(next,next.id,{globalRole:'user'})).statusCode,200);
    assert.equal((await h.call(next,'GET','/admin/overview')).statusCode,403);

    const post=(body:object)=>h.call(admin,'POST','/admin/restarts',body);
    assert.equal((await hOff.call(admin,'POST','/admin/restarts',request)).json().code,'RESTART_DISABLED');
    assert.equal((await h.inject({method:'POST',url:'/api/v1/admin/restarts',headers:{...h.headers(admin),'x-csrf-token':''},payload:request})).json().code,'CSRF_FAILED');
    assert.equal((await post({...request,password:'incorrect'})).json().code,'PASSWORD_MISMATCH');
    assert.equal((await post({...request,confirmation:appB.name})).statusCode,400);
    assert.equal((await post({...request,target:'demo'})).statusCode,400);
    assert.equal((await post({...request,command:'reset'})).statusCode,400);
    peerHealth='down';
    assert.equal((await post(request)).json().code,'REDUNDANCY_REQUIRED');
    assert.equal((await post({...request,target:'sfu-1',confirmation:sfu1.name})).json().code,'REDUNDANCY_REQUIRED');
    peerHealth='unknown';assert.equal((await post(request)).json().code,'HEALTH_UNKNOWN');
    peerHealth='healthy';

    const first=post(request);
    try{
      await Promise.race([dispatched,first.then(result=>{throw new Error(result.body);})]);
      const audit=(await h.call(admin,'GET','/audit-events?targetType=server&limit=1')).json();
      assert.equal(audit.items[0].action,'server.restart_requested');
      const concurrent=await h2.call(admin,'POST','/admin/restarts',request);
      assert.equal(concurrent.json().code,'RESTART_IN_PROGRESS');
    }finally{release();}
    assert.equal((await first).statusCode,202);assert.equal(press,1);
    await h.pool.query("update operations.restart_gate set started_at=clock_timestamp()-interval '1 minute' where singleton");
    observedBoot=Math.floor(Date.now()/1000);
    await Promise.all([h.services.operations.reconcile(),h2.services.operations.reconcile()]);
    const result=(await h.call(admin,'GET','/audit-events?targetType=server&action=server.restart_result&limit=1')).json();
    assert.equal(result.items[0].detail.result,'reboot_observed');
    const older=(await h.call(admin,'GET',`/audit-events?targetType=server&action=server.restart_result&beforeId=${result.items[0].id}`)).json();
    assert.ok(older.items.every((item:{targetId:string})=>item.targetId!==result.items[0].targetId));
    const cooldown=await h2.call(admin,'POST','/admin/restarts',request);
    assert.equal(cooldown.statusCode,429);assert.equal(cooldown.json().code,'RESTART_COOLDOWN');

    await h.pool.query("update operations.restart_gate set retry_at=clock_timestamp()-interval '1 second' where singleton");
    cloudResult='unknown';
    assert.equal((await post(request)).statusCode,503);
    assert.equal((await h2.call(admin,'POST','/admin/restarts',request)).json().code,'RESTART_IN_PROGRESS');
    const unknown=(await h.call(admin,'GET','/audit-events?targetType=server&action=server.restart_result&limit=1')).json().items[0];
    assert.equal(unknown.detail.result,'unknown');
    assert.ok(!JSON.stringify(unknown).includes(password));
  }finally{
    release();
    if(otherAdmins.length)await h.pool.query("update identity.users set global_role='admin' where id=any($1::uuid[])",[otherAdmins]);
    await h.pool.query(`update operations.restart_gate set retry_at=null,operation_id=null,actor_id=null,target=null,
      vm_name=null,boot_before=null,started_at=null,uncertainty_audited=false where singleton`);
    await Promise.all([hOff.close(),h2.close(),h.close()]);
  }
});
