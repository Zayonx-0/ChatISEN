import type {FastifyInstance} from 'fastify';
import type {IdentityService} from '../../../identity/index.js';
import {invalid} from '../../../../platform/errors.js';
import {guards,identityOf} from '../../../../platform/http.js';
import {body} from '../../../../platform/validation.js';
import type {OperationsService} from '../../application.js';
import {isTarget} from '../../domain.js';

export async function registerOperationsRoutes(app:FastifyInstance,operations:OperationsService,identity:IdentityService){
  const {authenticate,mutation}=guards(identity);
  app.get('/api/v1/admin/overview',{preHandler:authenticate},async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    return operations.overview(identityOf(request).user);
  });
  app.post('/api/v1/admin/restarts',{preHandler:mutation},async(request,reply)=>{
    const actor=identityOf(request);identity.requireAdmin(actor.user);
    const {target,confirmation,password}=body(request.body,['target','confirmation','password']);
    if(!isTarget(target)||typeof confirmation!=='string'||confirmation.length<1||confirmation.length>63||
      typeof password!=='string'||password.length>128)throw invalid('Demande de redémarrage invalide');
    await operations.restart(actor,target,confirmation,password);
    return reply.header('Cache-Control','no-store').code(202).send();
  });
}
