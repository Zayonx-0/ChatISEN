import type {FastifyInstance} from 'fastify';
import {invalid,notFound} from '../../../../platform/errors.js';
import {guards,identityOf,type SessionVerifier} from '../../../../platform/http.js';
import {body,isUuid,label,pageLimit} from '../../../../platform/validation.js';
import type {GroupService} from '../../application.js';
import {roles,type Role} from '../../domain.js';

const identifier=(value:string)=>{if(!isUuid(value))throw notFound('Conversation indisponible');return value.toLowerCase();};
const title=(value:unknown)=>label(value,120,'Titre invalide');

export async function registerGroupRoutes(app:FastifyInstance,groups:GroupService,sessions:SessionVerifier){
  const {authenticate,mutation}=guards(sessions);

  app.get('/api/v1/conversations',{preHandler:authenticate},async(request)=>{
    const query=request.query as {cursor?:unknown;limit?:unknown};
    if(query.cursor!==undefined&&!isUuid(query.cursor))throw invalid('Pagination invalide');
    return groups.list(identityOf(request).user.id,query.cursor as string|undefined,pageLimit(query.limit));
  });
  app.post('/api/v1/conversations',{preHandler:mutation},async(request,reply)=>{
    const input=body(request.body,['peerId']);
    if(!isUuid(input.peerId))throw invalid('Destinataire invalide');
    const result=await groups.openDirect(identityOf(request).user.id,input.peerId.toLowerCase());
    return reply.code(result.created?201:200).send(result.conversation);
  });
  app.get('/api/v1/conversations/:conversationId',{preHandler:authenticate},async(request)=>
    groups.detail(identifier((request.params as {conversationId:string}).conversationId),identityOf(request).user.id));

  app.post('/api/v1/groups',{preHandler:mutation},async(request,reply)=>{
    const input=body(request.body,['clientId','title','memberIds']);
    const members=input.memberIds;
    if(!isUuid(input.clientId)||!Array.isArray(members)||members.length<1||members.length>99||!members.every(isUuid))throw invalid('Groupe invalide');
    const result=await groups.createGroup(identityOf(request).user.id,input.clientId,title(input.title),members.map(member=>member.toLowerCase()));
    return reply.code(result.created?201:200).send(result.conversation);
  });
  app.patch('/api/v1/groups/:groupId',{preHandler:mutation},async(request)=>{
    const id=identifier((request.params as {groupId:string}).groupId);
    return groups.rename(id,identityOf(request).user.id,title(body(request.body,['title']).title));
  });
  app.put('/api/v1/groups/:groupId/members/:userId',{preHandler:mutation},async(request)=>{
    const params=request.params as {groupId:string;userId:string};
    const input=body(request.body,['role']);
    if(!roles.includes(input.role as Role))throw invalid('Rôle invalide');
    return groups.putMember(identifier(params.groupId),identityOf(request).user.id,identifier(params.userId),input.role as Role);
  });
  app.delete('/api/v1/groups/:groupId/members/:userId',{preHandler:mutation},async(request,reply)=>{
    const params=request.params as {groupId:string;userId:string};
    await groups.deleteMember(identifier(params.groupId),identityOf(request).user.id,identifier(params.userId));
    return reply.code(204).send();
  });
}
