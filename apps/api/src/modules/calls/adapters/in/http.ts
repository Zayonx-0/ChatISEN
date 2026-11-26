import type {FastifyInstance} from 'fastify';
import {Failure,invalid,notFound} from '../../../../platform/errors.js';
import {guards,identityOf,type SessionVerifier} from '../../../../platform/http.js';
import {listen} from '../../../../platform/listener.js';
import {outboxChannel} from '../../../../platform/realtime.js';
import type {Database} from '../../../../platform/db.js';
import {body,budget,isUuid} from '../../../../platform/validation.js';
import type {CallService} from '../../application.js';
import {callDto,maxSignalLength,type ParticipationState,type SignalType} from '../../domain.js';
import {iceServers} from '../out/ice.js';

const identifier=(value:string,what='Appel')=>{if(!isUuid(value))throw notFound(`${what} indisponible`);return value.toLowerCase();};
const callOf=(params:unknown)=>identifier((params as {callId:string}).callId);

export async function registerCallRoutes(app:FastifyInstance,calls:CallService,sessions:SessionVerifier,db:Database,{background=true}={}){
  const {authenticate,mutation}=guards(sessions);
  // Limite par session et par appel : un établissement normal envoie quelques dizaines de signaux.
  const signalBudget=budget(300);

  if(background){
    const report=(what:string)=>(error:unknown)=>app.log.error({err:error},what);
    const react=()=>{calls.removeDepartedMembers().then(()=>calls.runMediaJobs()).catch(report('Call event processing failed'));};
    const stop=listen(db,[outboxChannel],message=>{if(message.payload==='conversation.member_gone')react();},report('Call listener failed'));
    const sweeper=setInterval(()=>{calls.sweep().catch(report('Call sweep failed'));react();},5000);sweeper.unref();
    app.addHook('onClose',async()=>{stop();clearInterval(sweeper);});
  }

  app.post('/api/v1/conversations/:conversationId/calls',{preHandler:mutation},async(request,reply)=>{
    const conversationId=identifier((request.params as {conversationId:string}).conversationId,'Conversation'),identity=identityOf(request);
    const input=body(request.body,['clientId','mode']);
    if(!isUuid(input.clientId)||(input.mode!=='audio'&&input.mode!=='video'))throw invalid('Appel invalide');
    const result=await calls.start(conversationId,identity.user.id,identity.session.id,input.clientId.toLowerCase(),input.mode);
    return reply.code(result.created?201:200).send(callDto(result.call));
  });

  app.get('/api/v1/calls',{preHandler:authenticate},async(request)=>{
    const {state}=request.query as {state?:unknown};
    if(state!==undefined&&state!=='ringing'&&state!=='active')throw invalid('État invalide');
    return {items:(await calls.open(identityOf(request).user.id,state)).map(callDto)};
  });

  app.patch('/api/v1/calls/:callId',{preHandler:mutation},async(request)=>{
    const id=callOf(request.params);
    if(body(request.body,['state']).state!=='ended')throw invalid('Seul l’état « ended » est accepté');
    return callDto(await calls.end(id,identityOf(request).user.id));
  });

  app.put('/api/v1/calls/:callId/participants/me',{preHandler:mutation},async(request)=>{
    const id=callOf(request.params),identity=identityOf(request);
    const {state}=body(request.body,['state']);
    if(!['joined','declined','left'].includes(state as string))throw invalid('État invalide');
    return callDto(await calls.respond(id,identity.user.id,identity.session.id,state as ParticipationState));
  });

  app.post('/api/v1/calls/:callId/signals',{preHandler:mutation,bodyLimit:40_000},async(request,reply)=>{
    const id=callOf(request.params),identity=identityOf(request);
    const {type,data}=body(request.body,['type','data']);
    if(!['offer','answer','ice'].includes(type as string)||!data||typeof data!=='object'||Array.isArray(data)||JSON.stringify(data).length>maxSignalLength)throw invalid('Signal invalide');
    if(!signalBudget(`${identity.session.id}:${id}`))throw new Failure('rate_limited','Trop de signaux');
    await calls.signal(id,identity.user.id,identity.session.id,type as SignalType,data);
    return reply.code(202).send({accepted:true});
  });

  app.post('/api/v1/calls/:callId/media-tokens',{preHandler:mutation},async(request,reply)=>{
    const identity=identityOf(request);
    return reply.code(201).header('Cache-Control','no-store').send(await calls.admit(callOf(request.params),identity.user.id,identity.session.id));
  });

  app.get('/api/v1/ice-servers',{preHandler:authenticate},async(request,reply)=>{
    const identity=identityOf(request);
    reply.header('Cache-Control','no-store');
    return iceServers(identity.user.id,new Date(identity.session.expiresAt));
  });
}
