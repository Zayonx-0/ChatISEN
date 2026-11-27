import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {RawData,WebSocket} from 'ws';
import {randomUUID} from 'node:crypto';
import type {Database} from './db.js';
import {listen} from './listener.js';
import {guards,identityOf,requireOrigin,type Identity,type SessionVerifier} from './http.js';
import {isSeq,isUuid} from './validation.js';
import {eventChannel,userChannel,pruneRealtime,readEvents,readUserEvents,streamStates,userEventIds} from './realtime.js';
import {activeSockets} from './metrics.js';

/** Qui peut lire le topic conversation:{id} : la règle appartient au module groups. */
export interface TopicPolicy{canRead(conversationId:string,userId:string):Promise<boolean>}

type Subscription={socket:WebSocket;identity:Identity;conversationId:string;cursor:bigint;running:boolean;pending:boolean};
type Connection={socket:WebSocket;identity:Identity;seen:Map<string,number>;queue:Promise<void>;catchingUp:boolean;needsCatchUp:boolean};

/** Contrat AsyncAPI. PostgreSQL reste la source de vérité, NOTIFY ne fait que réveiller. */
export async function registerWebsocket(app:FastifyInstance,db:Database,sessions:SessionVerifier,topics:TopicPolicy){
  const {authenticate}=guards(sessions);
  const subscriptions=new Set<Subscription>();
  // Topic user:{userId}, abonné automatiquement à l'ouverture de la connexion.
  const connections=new Set<Connection>();
  const initialEvents=new WeakMap<FastifyRequest,string[]>();
  const send=(socket:WebSocket,value:unknown)=>{if(socket.readyState===1)socket.send(JSON.stringify(value));};
  const fail=(socket:WebSocket,code:string,message:string)=>send(socket,{v:1,type:'error',error:{code,message,requestId:randomUUID()}});
  const sessionStillValid=async(identity:Identity)=>{
    const current=await sessions.verify(identity.token);
    return current?.user.id===identity.user.id&&current.session.id===identity.session.id;
  };
  const authorized=async(sub:Subscription)=>await sessionStillValid(sub.identity)&&await topics.canRead(sub.conversationId,sub.identity.user.id);
  const live=(sub:Subscription)=>subscriptions.has(sub)&&sub.socket.readyState===1;
  const revoke=(sub:Subscription)=>{subscriptions.delete(sub);fail(sub.socket,'NOT_MEMBER','Accès indisponible');};

  const drain=async(sub:Subscription)=>{
    if(sub.running){sub.pending=true;return;}
    sub.running=true;
    try{
      do{
        sub.pending=false;
        if(!live(sub))return;
        if(!await authorized(sub))return revoke(sub);
        const events=await readEvents(db.pool,sub.conversationId,sub.cursor.toString(),100);
        for(const event of events){
          if(!live(sub))return;
          if(!await authorized(sub))return revoke(sub);
          if(sub.socket.bufferedAmount>1024*1024){send(sub.socket,{v:1,type:'resync_required',conversationId:sub.conversationId,fromSeq:sub.cursor.toString()});subscriptions.delete(sub);return;}
          send(sub.socket,{v:1,type:'event',conversationId:sub.conversationId,...event});
          sub.cursor=BigInt(event.seq);
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
      if(!await sessionStillValid(target.identity)){connections.delete(target);return;}
      for(const row of rows){
        if(target.socket.bufferedAmount>1024*1024){target.socket.close(1013);return;}
        send(target.socket,{...row.frame,eventId:row.id});
        target.seen.set(row.id,now);
      }
    }).catch(error=>{
      target.needsCatchUp=true;app.log.error({err:error},'User event delivery failed');
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
    socket.on('message',(raw:RawData)=>{void (async()=>{
      if(Buffer.byteLength(String(raw))>4096)return fail(socket,'BAD_REQUEST','Message trop volumineux');
      let message:{v?:unknown;type?:unknown;conversationId?:unknown;seq?:unknown;afterSeq?:unknown};
      try{message=JSON.parse(String(raw));}catch{return fail(socket,'BAD_REQUEST','Message invalide');}
      if(message?.v!==1)return fail(socket,'BAD_REQUEST','Version invalide');
      if(message.type==='ping')return send(socket,{v:1,type:'pong'});
      if(message.type==='ack'&&isUuid(message.conversationId)&&isSeq(message.seq))return;
      if(message.type==='unsubscribe'){for(const sub of subscriptions)if(sub.socket===socket&&sub.conversationId===message.conversationId)subscriptions.delete(sub);return;}
      if(message.type!=='subscribe'||!isUuid(message.conversationId)||!isSeq(message.afterSeq))return fail(socket,'BAD_REQUEST','Abonnement invalide');
      const sub:Subscription={socket,identity,conversationId:message.conversationId,cursor:BigInt(message.afterSeq),running:false,pending:false};
      if(!await authorized(sub))return fail(socket,'NOT_MEMBER','Accès indisponible');
      for(const existing of subscriptions)if(existing.socket===socket&&existing.conversationId===sub.conversationId)subscriptions.delete(existing);
      subscriptions.add(sub);
      const state=(await streamStates(db.pool,[sub.conversationId])).get(sub.conversationId);
      if(!state){subscriptions.delete(sub);return fail(socket,'NOT_FOUND','Conversation indisponible');}
      send(socket,{v:1,type:'subscribed',conversationId:sub.conversationId,snapshotSeq:state.lastSeq});
      await drain(sub);
    })().catch(error=>{app.log.error({err:error},'WebSocket message failed');fail(socket,'DEPENDENCY_UNAVAILABLE','Service temporairement indisponible');});});
  });
}
