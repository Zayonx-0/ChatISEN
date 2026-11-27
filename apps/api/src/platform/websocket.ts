import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {RawData,WebSocket} from 'ws';
import {randomUUID} from 'node:crypto';
import type {Database} from './db.js';
import {listen} from './listener.js';
import {guards,identityOf,requireOrigin,type Identity,type SessionVerifier} from './http.js';
import {body,isSeq,isUuid} from './validation.js';
import {eventChannel,userChannel,pruneRealtime,readEvents,readUserEvents,streamStates,userEventIds,type StreamEvent} from './realtime.js';
import {activeSockets,messageDelivery} from './metrics.js';

/** Qui peut lire le topic conversation:{id} : la règle appartient au module groups. */
export interface TopicPolicy{canRead(conversationId:string,userId:string):Promise<boolean>}

type Subscription={socket:WebSocket;identity:Identity;conversationId:string;cursor:bigint;unacknowledged:Map<bigint,number>;running:boolean;pending:boolean};
type Connection={socket:WebSocket;identity:Identity;seen:Map<string,number>;queue:Promise<void>;catchingUp:boolean;needsCatchUp:boolean};
type ClientFrame={type:'ping'}|{type:'unsubscribe';conversationId:string}|{type:'ack'|'subscribe';conversationId:string;seq:bigint};
type ErrorCode='BAD_REQUEST'|'UNAUTHORIZED'|'NOT_MEMBER'|'NOT_FOUND'|'DEPENDENCY_UNAVAILABLE';

function clientFrame(raw:RawData,binary:boolean):ClientFrame|undefined{
  if(binary||Buffer.byteLength(String(raw))>4096)return;
  try{
    const parsed:unknown=JSON.parse(String(raw));
    const envelope=body(parsed,['v','type'],['conversationId','seq','afterSeq']);
    const {v,type,conversationId}=envelope;
    if(v!==1)return;
    if(type==='ping'){body(parsed,['v','type']);return {type};}
    if(!isUuid(conversationId))return;
    const id=conversationId.toLowerCase();
    if(type==='unsubscribe'){body(parsed,['v','type','conversationId']);return {type,conversationId:id};}
    if(type!=='subscribe'&&type!=='ack')return;
    const field=type==='subscribe'?'afterSeq':'seq';
    const seq=body(parsed,['v','type','conversationId',field])[field];
    if(isSeq(seq))return {type,conversationId:id,seq:BigInt(seq)};
  }catch{return;}
}

/** Contrat AsyncAPI. PostgreSQL reste la source de vérité, NOTIFY ne fait que réveiller. */
export async function registerWebsocket(app:FastifyInstance,db:Database,sessions:SessionVerifier,topics:TopicPolicy,trackDelivery:(event:StreamEvent)=>boolean){
  const {authenticate}=guards(sessions);
  const subscriptions=new Set<Subscription>();
  // Topic user:{userId}, abonné automatiquement à l'ouverture de la connexion.
  const connections=new Set<Connection>();
  const initialEvents=new WeakMap<FastifyRequest,string[]>();
  const send=(socket:WebSocket,value:unknown)=>{if(socket.readyState===1)socket.send(JSON.stringify(value));};
  const fail=(socket:WebSocket,code:ErrorCode,message:string)=>send(socket,{v:1,type:'error',error:{code,message,requestId:randomUUID()}});
  const sessionStillValid=async(identity:Identity)=>{
    const current=await sessions.verify(identity.token);
    return current?.user.id===identity.user.id&&current.session.id===identity.session.id;
  };
  const authenticateSocket=async(socket:WebSocket,identity:Identity)=>{
    if(await sessionStillValid(identity))return true;
    fail(socket,'UNAUTHORIZED','Session expirée');socket.close(1008);return false;
  };
  const canRead=async(sub:Subscription)=>{
    if(!await authenticateSocket(sub.socket,sub.identity))return false;
    if(await topics.canRead(sub.conversationId,sub.identity.user.id))return true;
    fail(sub.socket,'NOT_MEMBER','Accès indisponible');return false;
  };
  const live=(sub:Subscription)=>subscriptions.has(sub)&&sub.socket.readyState===1;

  const drain=async(sub:Subscription)=>{
    if(sub.running){sub.pending=true;return;}
    sub.running=true;
    try{
      do{
        sub.pending=false;
        if(!live(sub))return;
        if(!await canRead(sub)){subscriptions.delete(sub);return;}
        const events=await readEvents(db.pool,sub.conversationId,sub.cursor.toString(),100);
        for(const event of events){
          if(!live(sub))return;
          if(!await canRead(sub)){subscriptions.delete(sub);return;}
          if(!live(sub))return;
          if(sub.socket.bufferedAmount>1024*1024){send(sub.socket,{v:1,type:'resync_required',conversationId:sub.conversationId,fromSeq:sub.cursor.toString()});subscriptions.delete(sub);return;}
          send(sub.socket,{v:1,type:'event',conversationId:sub.conversationId,...event});
          sub.cursor=BigInt(event.seq);
          if(trackDelivery(event)){
            const pending=sub.unacknowledged;
            // Les anciens clients n'acquittent pas encore les événements.
            if(pending.size>=1000)pending.delete(pending.keys().next().value!);
            pending.set(sub.cursor,Date.parse(event.at));
          }
        }
        if(events.length===100)sub.pending=true;
      }while(sub.pending);
    }catch(error){app.log.error({err:error},'Event stream unavailable');fail(sub.socket,'DEPENDENCY_UNAVAILABLE','Service temporairement indisponible');}
    finally{sub.running=false;}
  };
  const deliverUserEvents=(target:Connection,id?:string)=>{
    if(id===undefined){
      target.needsCatchUp=true;
      if(target.catchingUp)return;
      target.catchingUp=true;
    }
    target.queue=target.queue.then(async()=>{
      if(id===undefined)target.needsCatchUp=false;
      if(!connections.has(target)||target.socket.readyState!==1)return;
      const now=Date.now();
      for(const [seen,at] of target.seen){if(now-at<360_000)break;target.seen.delete(seen);}
      if(id&&target.seen.has(id))return;
      const rows=await readUserEvents(db.pool,target.identity.user.id,target.identity.session.id,id??[...target.seen.keys()]);
      if(!rows.length)return;
      if(!await authenticateSocket(target.socket,target.identity))return;
      for(const row of rows){
        if(target.socket.bufferedAmount>1024*1024){target.socket.close(1013);return;}
        send(target.socket,{...row.frame,eventId:row.id});
        target.seen.set(row.id,now);
      }
    }).catch(error=>{
      target.needsCatchUp=true;app.log.error({err:error},'User event delivery failed');
      fail(target.socket,'DEPENDENCY_UNAVAILABLE','Service temporairement indisponible');
    }).finally(()=>{if(id===undefined)target.catchingUp=false;});
  };
  const wake=(conversationId?:string)=>{for(const sub of subscriptions)if(!conversationId||sub.conversationId===conversationId)void drain(sub);};
  const recover=()=>{wake();for(const connection of connections)deliverUserEvents(connection);};
  const onError=(error:unknown)=>app.log.error({err:error},'PostgreSQL listener failed');
  const stop=listen(db,[eventChannel,userChannel],message=>{
    let payload:{conversationId?:unknown;id?:unknown;userId?:unknown};
    try{payload=JSON.parse(message.payload||'{}');}catch{return;}
    if(message.channel===userChannel){
      if(isSeq(payload?.id))for(const connection of connections)if(connection.identity.user.id===payload.userId)deliverUserEvents(connection,payload.id);
      return;
    }
    if(typeof payload?.conversationId==='string')wake(payload.conversationId);
  },onError,recover);
  const catchUp=setInterval(()=>{
    wake();
    for(const connection of connections)if(connection.needsCatchUp)deliverUserEvents(connection);
  },10_000);catchUp.unref();
  const prune=setInterval(()=>{pruneRealtime(db.pool).catch(error=>app.log.error({err:error},'Realtime cleanup failed'));},60_000);prune.unref();
  app.addHook('onClose',async()=>{stop();clearInterval(catchUp);clearInterval(prune);connections.clear();subscriptions.clear();});

  app.get('/api/v1/ws',{websocket:true,preValidation:async(request,reply)=>{
    requireOrigin(request);await authenticate(request,reply);
    if((request.query as {resumeUserEvents?:string}).resumeUserEvents!=='1'){
      // Seules les lignes déjà visibles sont ignorées à la première ouverture de l'onglet.
      const {user,session}=identityOf(request);
      initialEvents.set(request,await userEventIds(db.pool,user.id,session.id));
    }
  }},(socket,request)=>{
    const now=Date.now();
    const seenUserEventIds=initialEvents.get(request)??[];
    const connection:Connection={socket,identity:identityOf(request),seen:new Map(seenUserEventIds.map(id=>[id,now])),queue:Promise.resolve(),catchingUp:false,needsCatchUp:false};
    const {identity}=connection;
    connections.add(connection);activeSockets.inc();
    send(socket,{v:1,type:'ready',heartbeatSeconds:30,...(seenUserEventIds.length?{seenUserEventIds}:{})});
    deliverUserEvents(connection);
    socket.on('close',()=>{activeSockets.dec();connections.delete(connection);for(const sub of subscriptions)if(sub.socket===socket)subscriptions.delete(sub);});
    let commands=Promise.resolve();
    socket.on('message',(raw:RawData,binary:boolean)=>{
      const frame=clientFrame(raw,binary);
      if(!frame)return fail(socket,'BAD_REQUEST','Trame invalide');
      commands=commands.then(async()=>{
        if(socket.readyState!==1)return;
        if(frame.type==='ping'){
          if(await authenticateSocket(socket,identity))send(socket,{v:1,type:'pong'});
          return;
        }
        const existing=[...subscriptions].find(sub=>sub.socket===socket&&sub.conversationId===frame.conversationId);
        if(frame.type==='unsubscribe'){if(existing)subscriptions.delete(existing);return;}
        if(frame.type==='ack'){
          if(!existing)return;
          if(frame.seq>existing.cursor)return fail(socket,'BAD_REQUEST','Numéro non envoyé');
          const now=Date.now();
          for(const [seq,at] of existing.unacknowledged){
            if(seq>frame.seq)break;
            messageDelivery.observe(Math.max(0,now-at)/1000);existing.unacknowledged.delete(seq);
          }
          return;
        }
        const sub:Subscription={socket,identity,conversationId:frame.conversationId,cursor:frame.seq,unacknowledged:new Map(),running:false,pending:false};
        if(!await canRead(sub))return;
        const state=(await streamStates(db.pool,[sub.conversationId])).get(sub.conversationId);
        if(!state)return fail(socket,'NOT_FOUND','Conversation indisponible');
        if(socket.readyState!==1)return;
        if(existing)subscriptions.delete(existing);
        subscriptions.add(sub);
        send(socket,{v:1,type:'subscribed',conversationId:sub.conversationId,snapshotSeq:state.lastSeq});
        void drain(sub);
      }).catch(error=>{app.log.error({err:error},'WebSocket message failed');fail(socket,'DEPENDENCY_UNAVAILABLE','Service temporairement indisponible');});
    });
  });
}
