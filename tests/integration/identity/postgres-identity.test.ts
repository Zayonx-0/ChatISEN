import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const requireFromApi=createRequire(new URL('../../../apps/api/package.json',import.meta.url));
const Fastify=requireFromApi('fastify') as typeof import('fastify').default;
const cookie=requireFromApi('@fastify/cookie') as typeof import('@fastify/cookie').default;
import {Pool} from 'pg';
import {applyMigrations} from '../../../db/migrate.mjs';
import {PostgresRepository} from '../../../apps/api/src/repositories/postgres.js';
import {registerPostgresIdentity} from '../../../apps/api/src/identity/postgres-routes.js';

const databaseUrl=process.env.DATABASE_URL;
test('F01 S01 PostgreSQL identity persists session and enforces origin and CSRF',async t=>{
  if(!databaseUrl)return t.skip('DATABASE_URL not set');
  process.env.CORS_ORIGIN='https://chatisen.test';process.env.CSRF_SECRET='integration-only';
  const migrationPool=new Pool({connectionString:databaseUrl});const client=await migrationPool.connect();
  try{await applyMigrations(client);}finally{client.release();await migrationPool.end();}
  const {default:app}=await import('../../../apps/api/src/server.js');
  const handle=`r_${randomBytes(5).toString('hex')}`;const password='secure-password-2026';
  try{
    const anonymous=await app.inject({method:'GET',url:'/api/v1/me'});assert.equal(anonymous.statusCode,401);
    const denied=await app.inject({method:'POST',url:'/api/v1/auth/register',headers:{origin:'https://evil.test'},payload:{handle,displayName:'Alice',password}});assert.equal(denied.statusCode,403);
    const registered=await app.inject({method:'POST',url:'/api/v1/auth/register',headers:{origin:'https://chatisen.test'},payload:{handle,displayName:'Alice',password}});
    assert.equal(registered.statusCode,201,registered.body);
    const setCookie=String(registered.headers['set-cookie']);assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/Secure/i);assert.match(setCookie,/SameSite=Lax/i);
    const cookieHeader=setCookie.split(';')[0];const first=registered.json();assert.equal(first.user.handle,handle);assert.equal(first.user.passwordHash,undefined);
    const me=await app.inject({method:'GET',url:'/api/v1/me',headers:{cookie:cookieHeader}});assert.equal(me.statusCode,200);assert.equal(me.json().id,first.user.id);
    const badCsrf=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{cookie:cookieHeader,origin:'https://chatisen.test'}});assert.equal(badCsrf.statusCode,403);
    await app.close();
    // New process-equivalent app and pool must recognize the previously created session.
    const restarted=Fastify();const repo=new PostgresRepository(databaseUrl);await restarted.register(cookie);await registerPostgresIdentity(restarted,repo);
    try{
      const recovered=await restarted.inject({method:'GET',url:'/api/v1/me',headers:{cookie:cookieHeader}});assert.equal(recovered.statusCode,200);assert.equal(recovered.json().id,first.user.id);
      const logout=await restarted.inject({method:'POST',url:'/api/v1/auth/logout',headers:{cookie:cookieHeader,origin:'https://chatisen.test','x-csrf-token':first.user.csrfToken}});assert.equal(logout.statusCode,204);
      const revoked=await restarted.inject({method:'GET',url:'/api/v1/me',headers:{cookie:cookieHeader}});assert.equal(revoked.statusCode,401);
      const login=await restarted.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:'https://chatisen.test'},payload:{handle,password}});assert.equal(login.statusCode,200);
    }finally{await restarted.close();await repo.close();}
  }finally{await app.close();}
});
