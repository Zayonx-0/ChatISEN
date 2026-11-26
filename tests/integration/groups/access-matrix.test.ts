import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {matches,startApp,type Who} from '../helpers.js';

test('groups: the access matrix of the dossier, route by route',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const h=await startApp();
  try{
    const owner=await h.register('owner'),moderator=await h.register('modo'),member=await h.register('member'),other=await h.register('other'),outsider=await h.register('outsider');
    const command={clientId:randomUUID(),title:'Équipe',memberIds:[moderator.id,member.id,other.id]};
    const [first,retry]=await Promise.all([h.call(owner,'POST','/groups',command),h.call(owner,'POST','/groups',command)]);
    assert.deepEqual([first.statusCode,retry.statusCode].sort(),[200,201]);assert.equal(first.json().id,retry.json().id);matches('ConversationDetail',first.json());
    assert.equal((await h.call(owner,'POST','/groups',{...command,title:'Autre'})).statusCode,409);
    assert.equal((await h.call(owner,'POST','/groups',{clientId:randomUUID(),title:'Moi seul',memberIds:[owner.id]})).statusCode,400);
    assert.equal((await h.call(owner,'POST','/groups',{clientId:randomUUID(),title:'Inconnu',memberIds:[randomUUID()]})).statusCode,404);
    const id=first.json().id as string,group=`/groups/${id}`,seat=(who:Who)=>`${group}/members/${who.id}`;
    const status=async(who:Who,method:'PUT'|'DELETE'|'PATCH',url:string,payload?:object)=>(await h.call(who,method,url,payload)).statusCode;
    const roleOf=async(who:Who)=>(await h.call(owner,'GET',`/conversations/${id}`)).json().members.find((m:{user:{id:string}})=>m.user.id===who.id)?.role;

    assert.equal(await status(owner,'PUT',seat(moderator),{role:'moderator'}),200);
    assert.equal(await roleOf(moderator),'moderator');

    // Ajouter un membre, renommer, nommer un modérateur, transférer : propriétaire seulement.
    for(const actor of [moderator,member]){
      assert.equal(await status(actor,'PATCH',group,{title:'Interdit'}),403);
      assert.equal(await status(actor,'PUT',seat(outsider),{role:'member'}),403);
      assert.equal(await status(actor,'PUT',seat(other),{role:'moderator'}),403);
      assert.equal(await status(actor,'PUT',seat(actor),{role:'owner'}),403);
    }
    // Retirer : le modérateur retire un membre simple, jamais le propriétaire ni un modérateur.
    assert.equal(await status(member,'DELETE',seat(other)),403);
    assert.equal(await status(moderator,'DELETE',seat(owner)),403);
    assert.equal(await status(moderator,'DELETE',seat(other)),204);
    assert.equal((await h.call(other,'GET',`/conversations/${id}`)).statusCode,404);
    assert.equal(await status(owner,'PUT',seat(other),{role:'member'}),200);
    assert.equal(await status(owner,'PUT',seat(other),{role:'member'}),200,'adding twice is idempotent');
    assert.equal(await status(owner,'PUT',seat(other),{role:'moderator'}),200);
    assert.equal(await status(moderator,'DELETE',seat(other)),403);
    assert.equal(await status(owner,'PUT',seat(other),{role:'member'}),200);

    // Un non-membre ne voit pas le groupe, quelle que soit l'action.
    for(const [method,url,payload] of [['PATCH',group,{title:'X'}],['PUT',seat(outsider),{role:'member'}],['DELETE',seat(member),undefined]] as const)
      assert.equal(await status(outsider,method,url,payload),404);
    assert.equal(await status(owner,'PUT',seat(outsider),{role:'owner'}),409,'ownership goes to a member only');
    assert.equal(await status(owner,'PUT',seat(owner),{role:'member'}),409);
    assert.equal(await status(owner,'DELETE',seat(owner)),409,'the owner transfers before leaving');
    assert.equal(await status(owner,'PUT',`${group}/members/${randomUUID()}`,{role:'member'}),404);
    assert.equal(await status(owner,'PUT',seat(member),{role:'admin'}),400);

    const renamed=await h.call(owner,'PATCH',group,{title:'Projet'});assert.equal(renamed.statusCode,200);assert.equal(renamed.json().title,'Projet');matches('ConversationDetail',renamed.json());
    assert.equal(await status(owner,'PUT',seat(member),{role:'owner'}),200);
    const after=(await h.call(owner,'GET',`/conversations/${id}`)).json();
    assert.equal(after.members.filter((m:{role:string})=>m.role==='owner').length,1);assert.equal(after.role,'member');
    assert.equal(await status(owner,'PATCH',group,{title:'Interdit'}),403,'the former owner lost the right');

    // Une conversation privée ne se gère pas comme un groupe.
    const direct=await h.direct(owner,member);
    assert.equal(await status(owner,'PATCH',`/groups/${direct}`,{title:'X'}),404);
    assert.equal(await status(owner,'DELETE',`/groups/${direct}/members/${member.id}`),404);

    const list=await h.call(owner,'GET','/conversations?limit=1');assert.equal(list.statusCode,200);matches('ConversationList',list.json());assert.ok(list.json().nextCursor);
    const next=await h.call(owner,'GET',`/conversations?limit=1&cursor=${list.json().nextCursor}`);assert.equal(next.json().items.length,1);assert.equal(next.json().nextCursor,null);

    for(const who of [owner,moderator,other])assert.equal(await status(who,'DELETE',seat(who)),204);
    assert.equal(await status(member,'DELETE',seat(member)),204,'the last owner closes the group');
    assert.equal((await h.call(member,'GET',`/conversations/${id}`)).statusCode,404);

    // Les changements de droits sont journalisés dans la transaction qui les applique.
    const actions=(await h.pool.query('select action from identity.audit_log where target_id=$1 order by id',[id])).rows.map(r=>r.action);
    assert.deepEqual(actions,['group.role_changed','group.member_removed','group.role_changed','group.role_changed','group.owner_transferred']);
    const events=(await h.pool.query('select event_type from realtime.events where stream_id=$1 order by seq',[id])).rows.map(r=>r.event_type);
    for(const type of ['conversation.created','conversation.member_role_changed','conversation.member_removed','conversation.member_added','conversation.renamed','conversation.owner_transferred','conversation.member_left','conversation.closed'])assert.ok(events.includes(type),type);
  }finally{await h.close();}
});
