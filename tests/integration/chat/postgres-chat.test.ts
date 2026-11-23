import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {applyMigrations} from '../../../db/migrate.mjs';
import {validate,schemaAt} from '../../contract/validator.mjs';
import schema from '../../../packages/contracts/schemas/http.json' with {type:'json'};

const databaseUrl=process.env.DATABASE_URL;
test('F02 F04 S02 v1 direct and message routes use PostgreSQL with pagination and isolation',async t=>{
  if(!databaseUrl)return t.skip('DATABASE_URL not set');
  process.env.CORS_ORIGIN='https://chatisen.test';process.env.CSRF_SECRET='integration-only';
  const pool=new Pool({connectionString:databaseUrl});const client=await pool.connect();
  try{await applyMigrations(client);}finally{client.release();await pool.end();}
  const {default:app}=await import('../../../apps/api/src/server.js');const suffix=randomBytes(5).toString('hex');
  const origin='https://chatisen.test';
  const register=async(prefix:string)=>{const response=await app.inject({method:'POST',url:'/api/v1/auth/register',headers:{origin},payload:{handle:`${prefix}_${suffix}`,displayName:prefix,password:'secure-password-2026'}});assert.equal(response.statusCode,201,response.body);const user=response.json().user;validate(user,schemaAt(schema,'#/$defs/UserProfile'),schema);return {user,cookie:String(response.headers['set-cookie']).split(';')[0]};};
  try{
    const alice=await register('alice'),bob=await register('bob'),eve=await register('eve');
    const headers=(x:typeof alice)=>({origin,cookie:x.cookie,'x-csrf-token':x.user.csrfToken});
    const search=await app.inject({method:'GET',url:`/api/v1/users?handle=${bob.user.handle}`,headers:{cookie:alice.cookie}});assert.equal(search.statusCode,200);assert.equal(search.json().id,bob.user.id);
    const [one,two]=await Promise.all([app.inject({method:'POST',url:'/api/v1/conversations/direct',headers:headers(alice),payload:{peerId:bob.user.id}}),app.inject({method:'POST',url:'/api/v1/conversations/direct',headers:headers(bob),payload:{peerId:alice.user.id}})]);
    assert.deepEqual([one.statusCode,two.statusCode].sort(),[200,201]);const direct=one.json();assert.equal(direct.id,two.json().id);validate(direct,schemaAt(schema,'#/$defs/ConversationDetail'),schema);
    const groupCommand={clientId:randomUUID(),title:'Équipe',memberIds:[bob.user.id]};
    const [groupFirst,groupRetry]=await Promise.all([app.inject({method:'POST',url:'/api/v1/conversations/groups',headers:headers(alice),payload:groupCommand}),app.inject({method:'POST',url:'/api/v1/conversations/groups',headers:headers(alice),payload:groupCommand})]);
    assert.deepEqual([groupFirst.statusCode,groupRetry.statusCode].sort(),[200,201]);assert.equal(groupFirst.json().id,groupRetry.json().id);validate(groupFirst.json(),schemaAt(schema,'#/$defs/ConversationDetail'),schema);
    const groupConflict=await app.inject({method:'POST',url:'/api/v1/conversations/groups',headers:headers(alice),payload:{...groupCommand,title:'Autre'}});assert.equal(groupConflict.statusCode,409);
    const aliceList=await app.inject({method:'GET',url:'/api/v1/conversations?limit=1',headers:{cookie:alice.cookie}});assert.equal(aliceList.statusCode,200);validate(aliceList.json(),schemaAt(schema,'#/definitions/ConversationList'),schema);assert.equal(aliceList.json().items.length,1);assert.ok(aliceList.json().nextCursor);
    const nextList=await app.inject({method:'GET',url:`/api/v1/conversations?limit=1&cursor=${aliceList.json().nextCursor}`,headers:{cookie:alice.cookie}});assert.equal(nextList.statusCode,200);assert.equal(nextList.json().items.length,1);assert.equal(nextList.json().nextCursor,null);
    const groupDetail=await app.inject({method:'GET',url:`/api/v1/conversations/${groupFirst.json().id}`,headers:{cookie:bob.cookie}});assert.equal(groupDetail.statusCode,200);assert.equal(groupDetail.json().members.length,2);
    const hiddenGroup=await app.inject({method:'GET',url:`/api/v1/conversations/${groupFirst.json().id}`,headers:{cookie:eve.cookie}});assert.equal(hiddenGroup.statusCode,404);
    const url=`/api/v1/conversations/${direct.id}/messages`;
    const outsider=await app.inject({method:'GET',url,headers:{cookie:eve.cookie}});assert.equal(outsider.statusCode,404);
    const id=randomUUID();const payload={clientId:id,text:'bonjour'};
    const first=await app.inject({method:'POST',url,headers:headers(alice),payload});assert.equal(first.statusCode,201,first.body);validate(first.json(),schemaAt(schema,'#/$defs/Message'),schema);assert.equal(first.json().seq,'1');
    const retry=await app.inject({method:'POST',url,headers:headers(alice),payload});assert.equal(retry.statusCode,200);assert.equal(retry.json().id,first.json().id);
    const conflict=await app.inject({method:'POST',url,headers:headers(alice),payload:{clientId:id,text:'différent'}});assert.equal(conflict.statusCode,409);
    const writes=await Promise.all(Array.from({length:124},(_,i)=>app.inject({method:'POST',url,headers:headers(i%2?alice:bob),payload:{clientId:randomUUID(),text:`message ${i}`}})));
    assert.ok(writes.every(r=>r.statusCode===201));
    let before='';const seen:string[]=[];let pages=0;
    do{const page=await app.inject({method:'GET',url:`${url}?limit=50${before?'&beforeSeq='+before:''}`,headers:{cookie:bob.cookie}});assert.equal(page.statusCode,200);validate(page.json(),schemaAt(schema,'#/$defs/MessagePage'),schema);seen.push(...page.json().items.map((x:{id:string})=>x.id));before=page.json().nextBeforeSeq;pages++;}while(before);
    assert.equal(pages,3);assert.equal(seen.length,125);assert.equal(new Set(seen).size,125);
    const eventsUrl=`/api/v1/conversations/${direct.id}/events`;
    const deniedEvents=await app.inject({method:'GET',url:eventsUrl,headers:{cookie:eve.cookie}});assert.equal(deniedEvents.statusCode,404);
    const firstEvents=await app.inject({method:'GET',url:`${eventsUrl}?afterSeq=0&limit=100`,headers:{cookie:bob.cookie}});assert.equal(firstEvents.statusCode,200);validate(firstEvents.json(),schemaAt(schema,'#/$defs/EventPage'),schema);assert.equal(firstEvents.json().items.length,100);assert.equal(firstEvents.json().hasMore,true);assert.equal(firstEvents.json().nextAfterSeq,'100');
    const rest=await app.inject({method:'GET',url:`${eventsUrl}?afterSeq=100&limit=100`,headers:{cookie:bob.cookie}});assert.equal(rest.statusCode,200);assert.equal(rest.json().items.length,25);assert.equal(rest.json().hasMore,false);assert.equal(rest.json().nextAfterSeq,'125');

  }finally{await app.close();}
});
