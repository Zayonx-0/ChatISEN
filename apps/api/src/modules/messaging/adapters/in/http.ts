import type {FastifyInstance} from 'fastify';
import {invalid,notFound} from '../../../../platform/errors.js';
import {guards,identityOf,type SessionVerifier} from '../../../../platform/http.js';
import {body,isSeq,isUuid,pageLimit} from '../../../../platform/validation.js';
import type {MessageService} from '../../application.js';
import {command} from '../../domain.js';

const identifier=(params:unknown)=>{const {conversationId}=params as {conversationId:string};if(!isUuid(conversationId))throw notFound('Conversation indisponible');return conversationId.toLowerCase();};

export async function registerMessageRoutes(app:FastifyInstance,messages:MessageService,sessions:SessionVerifier){
  const {authenticate,mutation}=guards(sessions);
  app.get('/api/v1/conversations/:conversationId/messages',{preHandler:authenticate},async(request)=>{
    const query=request.query as {beforeSeq?:unknown;limit?:unknown};
    if(query.beforeSeq!==undefined&&!isSeq(query.beforeSeq))throw invalid('Pagination invalide');
    return messages.list(identifier(request.params),identityOf(request).user.id,pageLimit(query.limit),query.beforeSeq as string|undefined);
  });
  app.post('/api/v1/conversations/:conversationId/messages',{preHandler:mutation},async(request,reply)=>{
    const id=identifier(request.params);
    const result=await messages.post(id,identityOf(request).user.id,command(body(request.body,['clientId'],['text','fileId'])));
    return reply.code(result.created?201:200).send(result.message);
  });
  app.get('/api/v1/conversations/:conversationId/events',{preHandler:authenticate},async(request)=>{
    const {afterSeq,limit}=request.query as {afterSeq?:unknown;limit?:unknown};
    if(!isSeq(afterSeq))throw invalid('Pagination invalide');
    return messages.events(identifier(request.params),identityOf(request).user.id,afterSeq,pageLimit(limit));
  });
}
