import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {applyMigrations} from '../../../db/migrate.mjs';
import {validate,schemaAt} from '../../contract/validator.mjs';
import schema from '../../../packages/contracts/schemas/http.json' with {type:'json'};

test('calls v1 authorizes membership, signs bounded admissions and rejects invalid states',async t=>{
  const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)return t.skip('DATABASE_URL not set');
  process.env.CORS_ORIGIN='https://chatisen.test';process.env.CSRF_SECRET='integration-only';
  process.env.LIVEKIT_URL='wss://media.example.test/livekit';process.env.LIVEKIT_API_KEY='test-key';process.env.LIVEKIT_API_SECRET='test-secret';
  const pool=new Pool({connectionString:databaseUrl});const client=await pool.connect();try{await applyMigrations(client);}finally{client.release();}
  const {default:app}=await import('../../../apps/api/src/server.js');const suffix=randomBytes(5).toString('hex');const origin=process.env.CORS_ORIGIN;
  const register=async(prefix:string)=>{const r=await app.inject({method:'POST',url:'/api/v1/auth/register',headers:{origin},payload:{handle:`${prefix}_${suffix}`,displayName:prefix,password:'secure-password-2026'}});assert.equal(r.statusCode,201,r.body);return {user:r.json().user,cookie:String(r.headers['set-cookie']).split(';')[0]};};
  try{
    const alice=await register('alice'),bob=await register('bob'),eve=await register('eve');
    const headers=(x:typeof alice)=>({origin,cookie:x.cookie,'x-csrf-token':x.user.csrfToken});
    const direct=await app.inject({method:'POST',url:'/api/v1/conversations/direct',headers:headers(alice),payload:{peerId:bob.user.id}});assert.equal(direct.statusCode,201,direct.body);
    const createUrl=`/api/v1/conversations/${direct.json().id}/calls`;const payload={clientId:randomUUID(),mode:'audio'};
    delete process.env.CHATISEN_EXPERIMENTAL_CALLS;
    const disabled=await app.inject({method:'POST',url:createUrl,headers:headers(alice),payload});assert.equal(disabled.statusCode,503);
    process.env.CHATISEN_EXPERIMENTAL_CALLS='true';
    const denied=await app.inject({method:'POST',url:createUrl,headers:headers(eve),payload});assert.equal(denied.statusCode,404);
    const noCsrf=await app.inject({method:'POST',url:createUrl,headers:{origin,cookie:alice.cookie},payload});assert.equal(noCsrf.statusCode,403);
    const wrongOrigin=await app.inject({method:'POST',url:createUrl,headers:{...headers(alice),origin:'https://evil.test'},payload});assert.equal(wrongOrigin.statusCode,403);
    const [first,retry]=await Promise.all([app.inject({method:'POST',url:createUrl,headers:headers(alice),payload}),app.inject({method:'POST',url:createUrl,headers:headers(alice),payload})]);
    assert.deepEqual([first.statusCode,retry.statusCode].sort(),[200,201]);assert.equal(first.json().id,retry.json().id);validate(first.json(),schemaAt(schema,'#/$defs/CallSummary'),schema);
    const conflict=await app.inject({method:'POST',url:createUrl,headers:headers(alice),payload:{...payload,mode:'video'}});assert.equal(conflict.statusCode,409);
    const competing=await app.inject({method:'POST',url:createUrl,headers:headers(bob),payload:{clientId:randomUUID(),mode:'video'}});assert.equal(competing.statusCode,409);
    const id=first.json().id,joinUrl=`/api/v1/calls/${id}/join`;
    const third=await app.inject({method:'POST',url:joinUrl,headers:headers(eve)});assert.equal(third.statusCode,404);
    const join=await app.inject({method:'POST',url:joinUrl,headers:headers(bob)});assert.equal(join.statusCode,200,join.body);validate(join.json(),schemaAt(schema,'#/$defs/JoinCallResponse'),schema);assert.equal(join.headers['cache-control'],'no-store');
    const [head,body,signature]=join.json().token.split('.');const claims=JSON.parse(Buffer.from(body,'base64url').toString());
    assert.equal(signature,createHmac('sha256','test-secret').update(`${head}.${body}`).digest('base64url'));
    assert.equal(claims.video.room,first.json().roomName);assert.equal(claims.video.roomJoin,true);assert.ok(claims.sub.startsWith(`${bob.user.id}_`));assert.ok(claims.exp-claims.iat<=300);assert.equal(join.json().expiresAt,new Date(claims.exp*1000).toISOString());
    const participant=await pool.query('select session_id,livekit_identity from call_participants where call_id=$1 and user_id=$2',[id,bob.user.id]);assert.equal(participant.rowCount,1);assert.equal(participant.rows[0].livekit_identity,claims.sub);
    const memberEnd=await app.inject({method:'POST',url:`/api/v1/calls/${id}/end`,headers:headers(bob)});assert.equal(memberEnd.statusCode,403);
    const logout=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:headers(bob)});assert.equal(logout.statusCode,204);
    const revoked=await app.inject({method:'POST',url:joinUrl,headers:headers(bob)});assert.equal(revoked.statusCode,401);
    const forbiddenEnd=await app.inject({method:'POST',url:`/api/v1/calls/${id}/end`,headers:headers(bob)});assert.equal(forbiddenEnd.statusCode,401); // Bob's session has been revoked.
    const end=await app.inject({method:'POST',url:`/api/v1/calls/${id}/end`,headers:headers(alice)});assert.equal(end.statusCode,204);
    const repeatedEnd=await app.inject({method:'POST',url:`/api/v1/calls/${id}/end`,headers:headers(alice)});assert.equal(repeatedEnd.statusCode,204);
    const ended=await app.inject({method:'POST',url:joinUrl,headers:headers(alice)});assert.equal(ended.statusCode,409);
    delete process.env.LIVEKIT_API_SECRET;const missing=await app.inject({method:'POST',url:joinUrl,headers:headers(alice)});assert.equal(missing.statusCode,503);validate(missing.json(),schemaAt(schema,'#/$defs/ApiError'),schema);assert.ok(!missing.body.includes('token'));
  }finally{delete process.env.CHATISEN_EXPERIMENTAL_CALLS;await app.close();await pool.end();}
});
