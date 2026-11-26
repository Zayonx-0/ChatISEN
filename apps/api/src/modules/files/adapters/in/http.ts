import type {FastifyInstance} from 'fastify';
import {invalid,notFound} from '../../../../platform/errors.js';
import {guards,identityOf,type SessionVerifier} from '../../../../platform/http.js';
import {body,isUuid} from '../../../../platform/validation.js';
import type {FileService} from '../../application.js';
import {declaration} from '../../domain.js';

const identifier=(value:string,what:string)=>{if(!isUuid(value))throw notFound(`${what} indisponible`);return value.toLowerCase();};

export async function registerFileRoutes(app:FastifyInstance,files:FileService,sessions:SessionVerifier){
  const {authenticate,mutation}=guards(sessions);
  const sweep=setInterval(()=>{files.sweep().catch(error=>app.log.error({err:error},'File sweep failed'));},900_000);sweep.unref();
  app.addHook('onClose',async()=>clearInterval(sweep));

  app.post('/api/v1/conversations/:conversationId/files',{preHandler:mutation},async(request,reply)=>{
    const id=identifier((request.params as {conversationId:string}).conversationId,'Conversation');
    const input=body(request.body,['fileName','mediaType','size','sha256']);
    return reply.code(201).header('Cache-Control','no-store').send(await files.prepare(id,identityOf(request).user.id,declaration(input)));
  });
  app.patch('/api/v1/files/:fileId',{preHandler:mutation},async(request)=>{
    const id=identifier((request.params as {fileId:string}).fileId,'Fichier');
    if(body(request.body,['state']).state!=='available')throw invalid('Seul l’état « available » est accepté');
    return files.complete(id,identityOf(request).user.id);
  });
  app.get('/api/v1/files/:fileId',{preHandler:authenticate},async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    return files.download(identifier((request.params as {fileId:string}).fileId,'Fichier'),identityOf(request).user.id);
  });
}
