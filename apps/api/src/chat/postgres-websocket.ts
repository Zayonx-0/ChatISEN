import type {FastifyInstance} from 'fastify';
import type {PoolClient} from 'pg';
import type {WebSocket,RawData} from 'ws';
import {randomUUID} from 'node:crypto';
import {PostgresRepository} from '../repositories/postgres.js';
import {postgresAuthenticator,invalid,tokenHash,type AuthRequest} from '../identity/postgres-routes.js';
import {userChannel} from '../kernel/user-events.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const decimal=/^(0|[1-9][0-9]*)$/;
const maxSeq=9223372036854775807n;
type Subscription={socket:WebSocket;userId:string;token:string;conversationId:string;cursor:bigint;running:boolean;pending:boolean};

/** v1 event stream. PostgreSQL is the source of truth, NOTIFY only wakes readers. */
export async function registerPostgresWebsocket(app:FastifyInstance,repo:PostgresRepository){
  const authenticate=postgresAuthenticator(repo);
  const subscriptions=new Set<Subscription>();
  // Topic user:{userId}, abonné automatiquement à l'ouverture de la connexion.
  const personal=new Set<{socket:WebSocket;userId:string;sessionId:string;token:string}>();
  let queue=Promise.resolve();let listener:PoolClient|undefined;let reconnect:NodeJS.Timeout|undefined;let stopped=false;
  const send=(socket:WebSocket,value:unknown)=>{if(socket.readyState===1)socket.send(JSON.stringify(value));};
  const fail=(socket:WebSocket,code:string,message:string)=>send(socket,{v:1,type:'error',error:{code,message,requestId:randomUUID()}});
  const authorized=async(sub:Subscription)=>{const session=await repo.findSession(tokenHash(sub.token));return !!session&&session.userId===sub.userId&&await repo.isMember(sub.conversationId,sub.userId);};
  const drain=async(sub:Subscription)=>{
    if(sub.running){sub.pending=true;return;}sub.running=true;
    try{
      do{
        sub.pending=false;
        if(!subscriptions.has(sub)||sub.socket.readyState!==1)return;
        if(!await authorized(sub)){subscriptions.delete(sub);fail(sub.socket,'NOT_MEMBER','Accès indisponible');return;}
        const rows=await repo.pool.query(`select seq,event_type,payload,occurred_at from conversation_events where conversation_id=$1 and seq>$2 order by seq limit 100`,[sub.conversationId,sub.cursor.toString()]);
        for(const row of rows.rows){
          if(!subscriptions.has(sub)||sub.socket.readyState!==1)return;
          if(!await authorized(sub)){subscriptions.delete(sub);fail(sub.socket,'NOT_MEMBER','Accès indisponible');return;}
          if(sub.socket.bufferedAmount>1024*1024){send(sub.socket,{v:1,type:'resync_required',conversationId:sub.conversationId,fromSeq:sub.cursor.toString()});subscriptions.delete(sub);return;}
          const data={...row.payload};if(data.messageId&&!data.id){data.id=data.messageId;delete data.messageId;}
          send(sub.socket,{v:1,type:'event',conversationId:sub.conversationId,seq:String(row.seq),at:new Date(row.occurred_at).toISOString(),event:row.event_type,data});
          sub.cursor=BigInt(row.seq);
        }
        if(rows.rows.length===100)sub.pending=true;
      }while(sub.pending);
    }catch(error){app.log.error({err:error},'PostgreSQL event stream unavailable');fail(sub.socket,'DEPENDENCY_UNAVAILABLE','Service temporairement indisponible');}
    finally{sub.running=false;}
  };
  const deliverUserEvent=async(id:string,userId:string)=>{
    const sockets=[...personal].filter(p=>p.userId===userId&&p.socket.readyState===1);if(!sockets.length)return;
    const row=(await repo.pool.query('select session_id,frame from user_events where id=$1 and user_id=$2',[id,userId])).rows[0];if(!row)return;
    for(const target of sockets){
      if(row.session_id&&row.session_id!==target.sessionId)continue;
      const session=await repo.findSession(tokenHash(target.token));
      if(!session||session.userId!==userId){personal.delete(target);continue;}
      send(target.socket,row.frame);
    }
  };
  const cleanup=setInterval(()=>{repo.pool.query("delete from user_events where created_at<now()-interval '5 minutes'").catch(error=>app.log.error({err:error},'User event cleanup failed'));},60_000);cleanup.unref();
  const wake=(cid?:string)=>{for(const sub of subscriptions)if(!cid||sub.conversationId===cid)void drain(sub);};
  const schedule=()=>{if(!stopped&&!reconnect){reconnect=setTimeout(()=>{reconnect=undefined;void connect();},1000);reconnect.unref();}};
  const connect=async()=>{
    if(stopped||listener)return;
    try{
      const client=await repo.pool.connect();if(stopped){client.release();return;}listener=client;
      client.on('notification',message=>{try{
        const payload=JSON.parse(message.payload||'{}');
        // File d'attente unique : les signaux d'un appel arrivent dans leur ordre d'émission.
        if(message.channel===userChannel){queue=queue.then(()=>deliverUserEvent(payload.id,payload.userId)).catch(error=>{app.log.error({err:error},'User event delivery failed');});return;}
        if(typeof payload.conversationId==='string')wake(payload.conversationId);
      }catch{}});
      client.once('error',error=>{app.log.error({err:error},'PostgreSQL listener disconnected');if(listener===client)listener=undefined;client.release(true);schedule();});
      await client.query('LISTEN chatisen_conversation_events');await client.query(`LISTEN ${userChannel}`);wake();
    }catch(error){app.log.error({err:error},'Cannot start PostgreSQL listener');if(listener){listener.release(true);listener=undefined;}schedule();}
  };
  const timer=setInterval(()=>wake(),10000);timer.unref();void connect();
  app.addHook('onClose',async()=>{stopped=true;clearInterval(timer);clearInterval(cleanup);personal.clear();if(reconnect)clearTimeout(reconnect);if(listener){listener.release();listener=undefined;}subscriptions.clear();});
  app.get('/api/v1/ws',{websocket:true,preValidation:async(req,reply)=>{
    if(!process.env.CORS_ORIGIN||req.headers.origin!==process.env.CORS_ORIGIN)return invalid(reply,403,'ORIGIN_DENIED','Origine refusée');
    return authenticate(req as AuthRequest,reply);
  }},(socket,req)=>{
    const identity=(req as AuthRequest).identity!;
    const entry={socket,userId:identity.user.id,sessionId:identity.session.id,token:identity.token};personal.add(entry);
    send(socket,{v:1,type:'ready',heartbeatSeconds:30});
    socket.on('close',()=>{personal.delete(entry);for(const sub of subscriptions)if(sub.socket===socket)subscriptions.delete(sub);});
    socket.on('message',(raw:RawData)=>{void (async()=>{
      if(Buffer.byteLength(String(raw))>4096)return fail(socket,'BAD_REQUEST','Message trop volumineux');
      let message:any;try{message=JSON.parse(String(raw));}catch{return fail(socket,'BAD_REQUEST','Message invalide');}
      if(message?.v!==1)return fail(socket,'BAD_REQUEST','Version invalide');
      if(message.type==='ping'){send(socket,{v:1,type:'pong'});return;}
      if(message.type==='ack'&&typeof message.conversationId==='string'&&uuid.test(message.conversationId)&&typeof message.seq==='string'&&decimal.test(message.seq)&&message.seq.length<=19&&BigInt(message.seq)<=maxSeq)return;
      if(message.type==='unsubscribe'){for(const sub of subscriptions)if(sub.socket===socket&&sub.conversationId===message.conversationId)subscriptions.delete(sub);return;}
      if(message.type!=='subscribe'||typeof message.conversationId!=='string'||!uuid.test(message.conversationId)||typeof message.afterSeq!=='string'||!decimal.test(message.afterSeq)||message.afterSeq.length>19||BigInt(message.afterSeq)>maxSeq)return fail(socket,'BAD_REQUEST','Abonnement invalide');
      const sub:Subscription={socket,userId:identity.user.id,token:identity.token,conversationId:message.conversationId,cursor:BigInt(message.afterSeq),running:false,pending:false};
      if(!await authorized(sub))return fail(socket,'NOT_MEMBER','Accès indisponible');
      for(const existing of subscriptions)if(existing.socket===socket&&existing.conversationId===sub.conversationId)subscriptions.delete(existing);
      subscriptions.add(sub);
      const result=await repo.pool.query('select last_seq from conversations where id=$1',[sub.conversationId]);
      if(!result.rows[0]){subscriptions.delete(sub);return fail(socket,'NOT_FOUND','Conversation indisponible');}
      send(socket,{v:1,type:'subscribed',conversationId:sub.conversationId,snapshotSeq:String(result.rows[0].last_seq)});await drain(sub);
    })().catch(error=>{app.log.error({err:error},'WebSocket message failed');fail(socket,'DEPENDENCY_UNAVAILABLE','Service temporairement indisponible');});});
  });
}
