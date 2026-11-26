import type {FastifyInstance} from 'fastify';
import type {Database} from '../../../../platform/db.js';
import {notFound} from '../../../../platform/errors.js';
import {guards,identityOf,type SessionVerifier} from '../../../../platform/http.js';
import {listen} from '../../../../platform/listener.js';
import {outboxChannel} from '../../../../platform/realtime.js';
import {body,isUuid} from '../../../../platform/validation.js';
import type {NotificationService} from '../../application.js';

export async function registerNotificationRoutes(app:FastifyInstance,notifications:NotificationService,sessions:SessionVerifier,db:Database,{background=true}={}){
  const {authenticate,mutation}=guards(sessions);
  app.get('/api/v1/push-configuration',{preHandler:authenticate},async()=>notifications.configuration);
  app.post('/api/v1/push-subscriptions',{preHandler:mutation},async(request,reply)=>{
    const identity=identityOf(request);
    // « expirationTime » accompagne l'abonnement rendu par le navigateur : il est ignoré.
    const input=body(request.body,['endpoint','keys'],['expirationTime']);
    return reply.code(201).send(await notifications.subscribe(identity.user.id,identity.session.id,input));
  });
  app.delete('/api/v1/push-subscriptions/:subscriptionId',{preHandler:mutation},async(request,reply)=>{
    const {subscriptionId}=request.params as {subscriptionId:string};
    if(!isUuid(subscriptionId))throw notFound('Abonnement inconnu');
    await notifications.unsubscribe(subscriptionId,identityOf(request).user.id);
    return reply.code(204).send();
  });

  // Les tests coupent la boucle pour déclencher eux-mêmes chaque envoi.
  if(!background)return;
  const run=()=>{notifications.run().catch(error=>app.log.error({err:error},'Push dispatcher failed'));};
  // NOTIFY déclenche l'envoi immédiat ; l'intervalle rattrape les reprises et une écoute coupée.
  const stop=listen(db,[outboxChannel],message=>{if(message.payload!=='conversation.member_gone')run();},error=>app.log.error({err:error},'Cannot listen for outbox events'));
  const timer=setInterval(run,3000);timer.unref();
  const sweeper=setInterval(()=>{notifications.cleanup().catch(error=>app.log.error({err:error},'Push cleanup failed'));},3_600_000);sweeper.unref();
  app.addHook('onClose',async()=>{stop();clearInterval(timer);clearInterval(sweeper);});
}
