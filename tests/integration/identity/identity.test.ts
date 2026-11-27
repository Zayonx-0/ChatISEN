import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {matches,origin,password,startApp} from '../helpers.js';

test('identity: accounts, sessions, profile, search, administration and audit',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  let h=await startApp();
  try{
    const alice=await h.register('alice'),bob=await h.register('bob'),root=await h.register('root');
    const fresh=(payload:object,from=origin)=>h.inject({method:'POST',url:'/api/v1/users',headers:{origin:from},payload});
    assert.equal((await fresh({handle:`x_${h.suffix}`,displayName:'X',password},'https://evil.test')).statusCode,403);
    assert.equal((await fresh({handle:alice.handle,displayName:'Autre',password})).statusCode,409);
    assert.equal((await fresh({handle:`x_${h.suffix}`,displayName:'X',password:'court'})).statusCode,400);
    const extra=await fresh({handle:`x_${h.suffix}`,displayName:'X',password,globalRole:'admin'});
    assert.equal(extra.statusCode,400,'an unknown field is refused');matches('ApiError',extra.json());

    const cookie=String((await h.call(undefined,'POST','/sessions',{handle:alice.handle,password})).headers['set-cookie']);
    for(const flag of [/^__Host-chatisen=/,/HttpOnly/i,/Secure/i,/SameSite=Lax/i,/Path=\//])assert.match(cookie,flag);
    const wrong=await h.call(undefined,'POST','/sessions',{handle:alice.handle,password:'mauvais-mot-de-passe'});
    const unknown=await h.call(undefined,'POST','/sessions',{handle:`nobody_${h.suffix}`,password});
    assert.deepEqual([wrong.statusCode,unknown.statusCode],[401,401]);assert.equal(wrong.json().message,unknown.json().message);

    // La passerelle interroge ce contrôle : il ignore tout en-tête d'identité reçu.
    const gate=await h.inject({method:'GET',url:'/internal/auth/verify',headers:{cookie:alice.cookie,'x-user-id':bob.id}});
    assert.equal(gate.statusCode,204);assert.equal(gate.headers['x-user-id'],alice.id);assert.equal(gate.headers['cache-control'],'no-store');
    assert.equal((await h.inject({method:'GET',url:'/internal/auth/verify',headers:{'x-user-id':alice.id}})).statusCode,401);

    const me=await h.call(alice,'GET','/users/me');assert.equal(me.statusCode,200);matches('UserProfile',me.json());assert.equal(me.json().passwordHash,undefined);
    assert.equal((await h.inject({method:'PATCH',url:'/api/v1/users/me',headers:{origin,cookie:alice.cookie},payload:{displayName:'Sans CSRF'}})).statusCode,403);
    const renamed=await h.call(alice,'PATCH','/users/me',{displayName:'Alice Martin'});assert.equal(renamed.statusCode,200);assert.equal(renamed.json().displayName,'Alice Martin');matches('UserProfile',renamed.json());

    const search=await h.call(bob,'GET',`/users?q=${alice.handle.slice(0,12)}`);assert.equal(search.statusCode,200);matches('UserList',search.json());
    assert.deepEqual(search.json().items.map((u:{id:string})=>u.id),[alice.id]);
    assert.ok((await h.call(bob,'GET','/users?q=ice%20Mar')).json().items.some((u:{id:string})=>u.id===alice.id),'search by display name');
    assert.deepEqual((await h.call(bob,'GET','/users?q=%25%25')).json().items,[],'LIKE wildcards are literal');
    assert.equal((await h.call(bob,'GET','/users?q=a')).statusCode,400);
    assert.equal((await h.call(undefined,'GET','/users?q=alice')).statusCode,401);

    // Un compte ordinaire n'administre rien.
    assert.equal((await h.call(alice,'PATCH',`/users/${bob.id}`,{disabled:true})).statusCode,403);
    assert.equal((await h.call(alice,'GET','/audit-events')).statusCode,403);
    await h.pool.query("update identity.users set global_role='admin' where id=$1",[root.id]);
    assert.equal((await h.call(root,'PATCH',`/users/${root.id}`,{globalRole:'user'})).statusCode,409);
    assert.equal((await h.call(root,'PATCH',`/users/${randomUUID()}`,{disabled:true})).statusCode,404);
    assert.equal((await h.call(root,'PATCH',`/users/${bob.id}`,{})).statusCode,400);
    const conversation=await h.direct(alice,bob);
    assert.equal((await h.call(root,'GET',`/conversations/${conversation}/messages`)).statusCode,404,'an administrator reads no conversation');

    const bobPhone=await h.login(bob);
    const disabled=await h.call(root,'PATCH',`/users/${bob.id}`,{disabled:true});assert.equal(disabled.statusCode,200,disabled.body);matches('UserPublic',disabled.json());
    for(const who of [bob,bobPhone])assert.equal((await h.call(who,'GET','/users/me')).statusCode,401,'every session is revoked');
    assert.equal((await h.call(undefined,'POST','/sessions',{handle:bob.handle,password})).statusCode,401);
    assert.ok(!(await h.call(alice,'GET',`/users?q=${bob.handle}`)).json().items.length);
    assert.equal((await h.call(root,'PATCH',`/users/${bob.id}`,{disabled:false})).statusCode,200);
    await h.login(bob);
    const audit=await h.call(root,'GET','/audit-events?limit=2');assert.equal(audit.statusCode,200);matches('AuditEventPage',audit.json());
    assert.deepEqual(audit.json().items.map((e:{detail:{disabled:boolean}})=>e.detail.disabled),[false,true]);
    assert.ok(audit.json().items.every((e:{actorId:string;targetId:string})=>e.actorId===root.id&&e.targetId===bob.id));

    // Une nouvelle instance retrouve la session enregistrée en base.
    await h.close();h=await startApp();
    assert.equal((await h.call(alice,'GET','/users/me')).statusCode,200);
    assert.equal((await h.inject({method:'DELETE',url:'/api/v1/sessions/current',headers:{origin,cookie:alice.cookie}})).statusCode,403);
    assert.equal((await h.call(alice,'DELETE','/sessions/current')).statusCode,204);
    assert.equal((await h.call(alice,'GET','/users/me')).statusCode,401);
  }finally{await h.close();}
});
