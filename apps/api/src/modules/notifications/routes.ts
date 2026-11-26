import type {FastifyInstance} from 'fastify';
import type {PoolClient} from 'pg';
import type {PostgresRepository} from '../../repositories/postgres.js';
import {invalid,type AuthRequest} from '../../identity/postgres-routes.js';
import {guards,uuid} from '../../kernel/guards.js';
import {validSubscription,type PushConfig} from './push-port.js';
import {PushDispatcher} from './dispatcher.js';

export async function registerNotifications(app:FastifyInstance,repo:PostgresRepository,push:PushConfig|undefined,{background=true}:{background?:boolean}={}){
  const {authenticate,mutation}=guards(repo);

  app.get('/api/v1/push-configuration',{preHandler:authenticate},async()=>({available:Boolean(push),publicKey:push?.publicKey??null}));

  app.post('/api/v1/push-subscriptions',{preHandler:mutation},async(req,reply)=>{
    if(!push)return invalid(reply,503,'SERVICE_UNAVAILABLE','Notifications non configurées');
    const identity=(req as AuthRequest).identity!,body=req.body;
    if(!validSubscription(body))return invalid(reply,400,'VALIDATION_ERROR','Abonnement invalide');
    // Un navigateur n'a qu'un abonnement : il est rattaché à la session qui le déclare en dernier.
    const row=(await repo.pool.query<{id:string}>(`insert into push_subscriptions(user_id,session_id,endpoint,p256dh,auth) values($1,$2,$3,$4,$5)
      on conflict(endpoint) do update set user_id=excluded.user_id,session_id=excluded.session_id,p256dh=excluded.p256dh,auth=excluded.auth,created_at=now() returning id`,
      [identity.user.id,identity.session.id,body.endpoint,body.keys.p256dh,body.keys.auth])).rows[0];
    return reply.code(201).send({id:row.id});
  });

  app.delete('/api/v1/push-subscriptions/:id',{preHandler:mutation},async(req,reply)=>{
    const id=(req.params as {id:string}).id;
    if(!uuid.test(id))return invalid(reply,404,'NOT_FOUND','Abonnement inconnu');
    const removed=await repo.pool.query('delete from push_subscriptions where id=$1 and user_id=$2',[id,(req as AuthRequest).identity!.user.id]);
    return removed.rowCount?reply.code(204).send():invalid(reply,404,'NOT_FOUND','Abonnement inconnu');
  });

  // Les tests coupent la boucle pour déclencher eux-mêmes chaque envoi.
  if(!push||!background)return;
  const dispatcher=new PushDispatcher(repo,push,(message,error)=>app.log.warn({err:error},message));
  const run=()=>{dispatcher.run().catch(error=>app.log.error({err:error},'Push dispatcher failed'));};
  // NOTIFY déclenche l'envoi immédiat ; l'intervalle rattrape les reprises et une écoute coupée.
  let listener:PoolClient|undefined;let stopped=false;
  const listen=async()=>{if(stopped||listener)return;try{const client=await repo.pool.connect();if(stopped){client.release();return;}listener=client;client.on('notification',run);client.once('error',()=>{if(listener===client)listener=undefined;client.release(true);});await client.query('LISTEN chatisen_push');}catch(error){app.log.error({err:error},'Cannot listen for push events');}};
  void listen();
  const timer=setInterval(()=>{void listen();run();},3000);timer.unref();
  const sweeper=setInterval(()=>{dispatcher.cleanup().catch(error=>app.log.error({err:error},'Push cleanup failed'));},3_600_000);sweeper.unref();
  app.addHook('onClose',async()=>{stopped=true;clearInterval(timer);clearInterval(sweeper);if(listener){listener.release(true);listener=undefined;}});
}
