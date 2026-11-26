import type {FastifyInstance} from 'fastify';
import {notFound} from '../../../../platform/errors.js';
import {guards,identityOf,type SessionVerifier} from '../../../../platform/http.js';
import {body,isUuid} from '../../../../platform/validation.js';
import type {QualityService} from '../../application.js';
import {samples} from '../../domain.js';

export async function registerQualityRoutes(app:FastifyInstance,quality:QualityService,sessions:SessionVerifier){
  const {mutation}=guards(sessions);
  app.post('/api/v1/calls/:callId/quality-samples',{preHandler:mutation,bodyLimit:20_000},async(request,reply)=>{
    const {callId}=request.params as {callId:string};
    if(!isUuid(callId))throw notFound('Appel indisponible');
    await quality.ingest(callId.toLowerCase(),identityOf(request).user.id,samples(body(request.body,['samples']).samples));
    return reply.code(202).send({accepted:true});
  });
}
