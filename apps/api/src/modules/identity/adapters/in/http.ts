import type {FastifyInstance,FastifyReply} from 'fastify';
import {guards,identityOf,requireOrigin,type SessionUser} from '../../../../platform/http.js';
import {invalid,notFound} from '../../../../platform/errors.js';
import {cookieName,csrfFor} from '../../../../platform/security.js';
import {body,isUuid,pageLimit} from '../../../../platform/validation.js';
import {displayName,handle,handlePattern,password} from '../../domain.js';
import {sessionHours,type IdentityService} from '../../application.js';

const profile=(user:SessionUser,token:string)=>({id:user.id,handle:user.handle,displayName:user.displayName,createdAt:user.createdAt,csrfToken:csrfFor(token),globalRole:user.globalRole});
const cookieOptions={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/'};

export async function registerIdentityRoutes(app:FastifyInstance,identity:IdentityService){
  const {authenticate,mutation}=guards(identity);
  const open=(reply:FastifyReply,{user,token}:{user:SessionUser;token:string})=>
    reply.setCookie(cookieName,token,{...cookieOptions,maxAge:sessionHours*3600}).header('Cache-Control','no-store').code(201).send(profile(user,token));

  app.post('/api/v1/users',async(request,reply)=>{
    requireOrigin(request);
    const input=body(request.body,['handle','displayName','password']);
    return open(reply,await identity.register(handle(input.handle),displayName(input.displayName),password(input.password)));
  });
  app.post('/api/v1/sessions',async(request,reply)=>{
    requireOrigin(request);
    const input=body(request.body,['handle','password']);
    if(typeof input.handle!=='string'||typeof input.password!=='string'||input.password.length>128)throw invalid('Champs invalides');
    return open(reply,await identity.login(input.handle.toLowerCase(),input.password));
  });
  app.delete('/api/v1/sessions/current',{preHandler:mutation},async(request,reply)=>{
    await identity.logout(identityOf(request).session.id);
    return reply.clearCookie(cookieName,cookieOptions).code(204).send();
  });

  // Contrôle appelé par la passerelle (auth_request). Hors de /api : Nginx ne le publie pas.
  app.get('/internal/auth/verify',{preHandler:authenticate},async(request,reply)=>
    reply.header('X-User-Id',identityOf(request).user.id).header('Cache-Control','no-store').code(204).send());

  app.get('/api/v1/users/me',{preHandler:authenticate},async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    return profile(identityOf(request).user,identityOf(request).token);
  });
  app.patch('/api/v1/users/me',{preHandler:mutation},async(request)=>{
    const input=body(request.body,['displayName']);
    return profile(await identity.rename(identityOf(request).user.id,displayName(input.displayName)),identityOf(request).token);
  });
  app.get('/api/v1/users',{preHandler:authenticate},async(request)=>{
    const query=request.query as {q?:unknown;limit?:unknown};
    if(typeof query.q!=='string'||query.q.trim().length<2||query.q.length>32)throw invalid('La recherche compte 2 à 32 caractères');
    return {items:await identity.search(query.q.trim(),pageLimit(query.limit))};
  });
  app.patch('/api/v1/users/:userId',{preHandler:mutation},async(request)=>{
    const actor=identityOf(request);identity.requireAdmin(actor.user);
    const {userId}=request.params as {userId:string};
    if(!isUuid(userId))throw notFound('Utilisateur indisponible');
    const input=body(request.body,[],['globalRole','disabled','revokeSessions']);
    if(!Object.keys(input).length||(input.globalRole!==undefined&&input.globalRole!=='user'&&input.globalRole!=='admin')||
      (input.disabled!==undefined&&typeof input.disabled!=='boolean')||(input.revokeSessions!==undefined&&input.revokeSessions!==true))throw invalid('Modification invalide');
    return identity.administer(actor,userId.toLowerCase(),input as {globalRole?:'user'|'admin';disabled?:boolean;revokeSessions?:true});
  });
  app.get('/api/v1/admin/users',{preHandler:authenticate},async(request,reply)=>{
    const actor=identityOf(request).user;identity.requireAdmin(actor);
    const {q='',cursor,limit}=request.query as {q?:unknown;cursor?:unknown;limit?:unknown};
    if(typeof q!=='string'||q.length>80||(cursor!==undefined&&(typeof cursor!=='string'||!handlePattern.test(cursor))))throw invalid('Recherche ou pagination invalide');
    reply.header('Cache-Control','no-store');
    return identity.adminUsers(actor,pageLimit(limit),q.trim(),cursor);
  });
  app.get('/api/v1/audit-events',{preHandler:authenticate},async(request,reply)=>{
    const actor=identityOf(request).user;identity.requireAdmin(actor);
    const {beforeId,action,targetType,limit:requestedLimit}=request.query as Record<string,unknown>;
    if(beforeId!==undefined&&(typeof beforeId!=='string'||!/^[1-9][0-9]{0,17}$/.test(beforeId)))throw invalid('Pagination invalide');
    if(action!==undefined&&(typeof action!=='string'||!/^[a-z][a-z0-9_.-]{2,63}$/.test(action)))throw invalid('Action invalide');
    if(targetType!==undefined&&targetType!=='user'&&targetType!=='conversation'&&targetType!=='server')throw invalid('Type de cible invalide');
    const limit=pageLimit(requestedLimit),items=await identity.auditTrail(actor,limit+1,{beforeId,action,targetType});
    const more=items.length>limit;
    if(more)items.pop();
    reply.header('Cache-Control','no-store');
    return {items,nextBeforeId:more?items[items.length-1].id:null};
  });
}
