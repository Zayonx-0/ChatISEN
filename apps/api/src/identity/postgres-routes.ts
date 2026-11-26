import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {PostgresRepository} from '../repositories/postgres.js';
import {passwordHash,passwordVerify,csrfFor,csrfOk} from '../security.js';
import {sessionRevoked} from '../kernel/session-hooks.js';
import type {User,Session} from '../types.js';

export type AuthRequest=FastifyRequest & {identity?:{user:User;session:Session;token:string}};
export const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const cookieName='__Host-chatisen';
const handlePattern=/^[a-z0-9_]{3,32}$/;
export const invalid=(reply:FastifyReply,status:number,code:string,message:string)=>reply.code(status).send({code,message,requestId:randomUUID()});
const profile=(user:User,token:string)=>({id:user.id,handle:user.handle,displayName:user.displayName,createdAt:user.createdAt,csrfToken:csrfFor(token)});

/** Shared session lookup for PostgreSQL-backed v1 routes. */
export function postgresAuthenticator(repo:PostgresRepository){
  return async(req:AuthRequest,reply:FastifyReply)=>{
    const token=req.cookies[cookieName];
    const session=token?await repo.findSession(tokenHash(token)):undefined;
    const user=session?await repo.findUserById(session.userId):undefined;
    if(!token||!session||!user)return invalid(reply,401,'UNAUTHORIZED','Authentification requise');
    req.identity={user,session,token};
  };
}

/** Routes v1 identity persisted in PostgreSQL. Depends on @fastify/cookie. */
export async function registerPostgresIdentity(app:FastifyInstance,repo:PostgresRepository){
  const secureCookie=(reply:FastifyReply,value:string)=>reply.setCookie(cookieName,value,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:86400});
  const authenticate=postgresAuthenticator(repo);
  const sameOrigin=(req:FastifyRequest)=>Boolean(process.env.CORS_ORIGIN)&&req.headers.origin===process.env.CORS_ORIGIN;
  app.post('/api/v1/auth/register',async(req,reply)=>{
    if(!sameOrigin(req))return invalid(reply,403,'ORIGIN_DENIED','Origine refusée');
    const body=req.body as Record<string,unknown>|undefined;
    const handle=typeof body?.handle==='string'?body.handle.toLowerCase():'';
    const displayName=typeof body?.displayName==='string'?body.displayName.trim():'';
    const password=typeof body?.password==='string'?body.password:'';
    if(!handlePattern.test(handle)||!displayName||displayName.length>80||password.length<12||password.length>128)return invalid(reply,400,'VALIDATION_ERROR','Champs invalides');
    try{
      const user=await repo.createUser(handle,displayName,await passwordHash(password));
      const token=randomBytes(32).toString('base64url');await repo.createSession(user.id,tokenHash(token));secureCookie(reply,token);
      return reply.code(201).send({user:profile(user,token)});
    }catch(error){if((error as {code?:string}).code==='23505')return invalid(reply,409,'CONFLICT','Identifiant indisponible');throw error;}
  });
  app.post('/api/v1/auth/login',async(req,reply)=>{
    if(!sameOrigin(req))return invalid(reply,403,'ORIGIN_DENIED','Origine refusée');
    const body=req.body as Record<string,unknown>|undefined;
    const user=typeof body?.handle==='string'?await repo.findUserByHandle(body.handle):undefined;
    if(!user||typeof body?.password!=='string'||!(await passwordVerify(user.passwordHash,body.password)))return invalid(reply,401,'UNAUTHORIZED','Identifiants invalides');
    const token=randomBytes(32).toString('base64url');await repo.createSession(user.id,tokenHash(token));secureCookie(reply,token);
    return {user:profile(user,token)};
  });
  // Contrôle appelé par la passerelle (auth_request). Hors de /api : Nginx ne le publie pas.
  app.get('/internal/auth/session',{preHandler:authenticate},async(req,reply)=>{
    const identity=(req as AuthRequest).identity!;
    return reply.header('X-User-Id',identity.user.id).header('X-Session-Id',identity.session.id).header('Cache-Control','no-store').code(204).send();
  });
  app.get('/api/v1/me',{preHandler:authenticate},async(req)=>profile((req as AuthRequest).identity!.user,(req as AuthRequest).identity!.token));
  app.post('/api/v1/auth/logout',{preHandler:authenticate},async(req,reply)=>{
    const identity=(req as AuthRequest).identity!;
    if(!sameOrigin(req))return invalid(reply,403,'ORIGIN_DENIED','Origine refusée');
    if(!csrfOk(identity.token,String(req.headers['x-csrf-token']||'')))return invalid(reply,403,'CSRF_FAILED','Jeton CSRF invalide');
    await repo.revokeSession(identity.session.id);
    // Une session fermée perd ses abonnements Push et quitte ses appels.
    await repo.pool.query('delete from push_subscriptions where session_id=$1',[identity.session.id]);
    await sessionRevoked(app,identity.session.id);
    reply.clearCookie(cookieName,{path:'/',secure:true,httpOnly:true,sameSite:'lax'});
    return reply.code(204).send();
  });
}
