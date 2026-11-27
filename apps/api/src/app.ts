/** Racine de composition : seul fichier qui connaît tous les modules et les assemble. */
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import {Database} from './platform/db.js';
import {SessionHooks} from './platform/hooks.js';
import {requestId,useApiErrors} from './platform/http.js';
import {collectMetrics,observeHttp,registry} from './platform/metrics.js';
import {registerWebsocket} from './platform/websocket.js';
import {IdentityService,registerIdentityRoutes} from './modules/identity/index.js';
import {GroupService,registerGroupRoutes} from './modules/groups/index.js';
import {FileService,gcsStore,registerFileRoutes,type ObjectStore} from './modules/files/index.js';
import {MessageService,registerMessageRoutes} from './modules/messaging/index.js';
import {CallService,livekitFromEnv,registerCallRoutes,type MediaServer} from './modules/calls/index.js';
import {QualityService,registerQualityRoutes} from './modules/quality/index.js';
import {NotificationService,registerNotificationRoutes,webPushFromEnv,type PushConfig} from './modules/notifications/index.js';

export type AppOptions={
  databaseUrl:string;
  /** Adaptateurs sortants. Absents de l'objet : lus dans l'environnement. */
  push?:PushConfig;media?:MediaServer;objects?:ObjectStore;
  /** Faux dans les tests qui déclenchent eux-mêmes les traitements de fond. */
  background?:boolean;
  logger?:boolean;
  metricsRoute?:boolean;
};

export async function buildApp(options:AppOptions){
  const app=Fastify({
    logger:options.logger?{redact:{paths:['err'],remove:true}}:false,
    trustProxy:process.env.TRUST_PROXY==='true',requestIdLogLabel:'requestId',
    disableRequestLogging:true,requestIdHeader:false,genReqId:request=>requestId(request.headers['x-request-id']),
  });
  app.addHook('onResponse',async(request,reply)=>{
    if(request.url==='/readyz'||request.url==='/metrics')return;
    request.log.info({method:request.method,status:reply.statusCode,elapsedMs:reply.elapsedTime},'Requête HTTP');
  });
  // Inventaire des routes, comparé au contrat par les tests.
  const routes:{method:string;url:string}[]=[];
  app.addHook('onRoute',route=>{for(const method of [route.method].flat())routes.push({method,url:route.url});});
  await app.register(cookie);
  await app.register(cors,{origin:process.env.CORS_ORIGIN||false,credentials:true});
  await app.register(websocket);
  useApiErrors(app);

  const db=new Database(options.databaseUrl);
  // Les crochets onClose s'exécutent dans l'ordre inverse d'ajout : inscrit en premier, celui-ci
  // ferme le pool après que les écouteurs ont rendu leurs connexions.
  app.addHook('onClose',async()=>{await db.close();});
  const report=(what:string)=>(error:unknown)=>app.log.error({err:error},what);
  const hooks=new SessionHooks(report('Session revocation hook failed'));
  const setting=<K extends 'push'|'media'|'objects'>(name:K,fromEnv:()=>AppOptions[K])=>name in options?options[name]:fromEnv();

  const identity=new IdentityService(db,hooks);
  const groups=new GroupService(db,identity,identity,report('List change notification failed'));
  const files=new FileService(db,groups,setting('objects',()=>process.env.FILES_BUCKET?gcsStore(process.env.FILES_BUCKET):undefined),report('Object storage signing failed'));
  const messages=new MessageService(db,groups,files);
  const sweepFiles=()=>files.sweep((tx,id)=>messages.referencesFile(tx,id));
  if(options.background??true){
    const sweep=setInterval(()=>{sweepFiles().catch(report('File sweep failed'));},900_000);sweep.unref();
    app.addHook('onClose',async()=>clearInterval(sweep));
  }
  const calls=new CallService(db,groups,identity,setting('media',()=>livekitFromEnv()));
  const quality=new QualityService(db,calls);
  const notifications=new NotificationService(db,groups,identity,identity,setting('push',()=>webPushFromEnv()),(message,error)=>app.log.warn({err:error},message));
  hooks.onRevoked(sessionId=>notifications.forgetSession(sessionId));
  hooks.onRevoked(sessionId=>calls.endForSession(sessionId));

  await registerIdentityRoutes(app,identity);
  await registerGroupRoutes(app,groups,identity);
  await registerMessageRoutes(app,messages,identity);
  await registerFileRoutes(app,files,identity);
  await registerCallRoutes(app,calls,identity,db,{background:options.background??true});
  await registerQualityRoutes(app,quality,identity);
  await registerNotificationRoutes(app,notifications,identity,db,{background:options.background??true});
  await registerWebsocket(app,db,identity,{canRead:async(conversationId,userId)=>Boolean(await groups.membership(conversationId,userId))},
    event=>event.event==='message.created');

  observeHttp(app);
  app.get('/healthz',async()=>({status:'ok',service:'chatisen-api',time:new Date().toISOString()}));
  app.get('/readyz',async(_request,reply)=>{
    try{await db.ping();return {status:'ready',database:'postgres',version:'2.0.0'};}
    catch{return reply.code(503).send({status:'unavailable',database:'postgres'});}
  });
  if(options.metricsRoute)app.get('/metrics',async(_request,reply)=>{reply.header('Content-Type',registry.contentType);return collectMetrics(db.pool);});
  return {app,db,routes,services:{identity,groups,files,messages,calls,quality,notifications,sweepFiles}};
}
