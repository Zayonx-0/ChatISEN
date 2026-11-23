import type {FastifyInstance,FastifyReply} from 'fastify';
import {createHmac,randomUUID} from 'node:crypto';
import {PostgresRepository} from '../repositories/postgres.js';
import {postgresAuthenticator,invalid,type AuthRequest} from '../identity/postgres-routes.js';
import {csrfOk} from '../security.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CallRow={id:string;conversation_id:string;initiator_id:string;client_id:string;mode:'audio'|'video';state:'ringing'|'active'|'ended';room_name:string;created_at:Date;ended_at:Date|null};
const summary=(c:CallRow)=>({id:c.id,conversationId:c.conversation_id,initiatorId:c.initiator_id,mode:c.mode,state:c.state,roomName:c.room_name,createdAt:new Date(c.created_at).toISOString(),...(c.ended_at?{endedAt:new Date(c.ended_at).toISOString()}:{})});
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');

// LiveKit's access token is an HS256 JWT with an explicitly scoped video grant.
// No shared secret, session token or user profile is included in the payload.
export function signAdmission(key:string,secret:string,room:string,identity:string,issuedAt:number,expiresAt:number){
  const content=`${encode({alg:'HS256',typ:'JWT'})}.${encode({iss:key,sub:identity,nbf:issuedAt,iat:issuedAt,exp:expiresAt,video:{roomJoin:true,room,canPublish:true,canSubscribe:true}})}`;
  return `${content}.${createHmac('sha256',secret).update(content).digest('base64url')}`;
}

/** Partial calls v1: no claim that a participant has connected to LiveKit. */
export async function registerPostgresCalls(app:FastifyInstance,repo:PostgresRepository){
  const authenticate=postgresAuthenticator(repo);
  const mutation=async(req:AuthRequest,reply:FastifyReply)=>{
    // Experimental only: media revocation is not implemented yet.
    if(process.env.CHATISEN_EXPERIMENTAL_CALLS!=='true')return invalid(reply,503,'SERVICE_UNAVAILABLE','Appels expérimentaux désactivés');
    await authenticate(req,reply);if(reply.sent)return;
    if(!process.env.CORS_ORIGIN||req.headers.origin!==process.env.CORS_ORIGIN)return invalid(reply,403,'ORIGIN_DENIED','Origine refusée');
    if(!csrfOk(req.identity!.token,String(req.headers['x-csrf-token']||'')))return invalid(reply,403,'CSRF_FAILED','Jeton CSRF invalide');
  };
  app.post('/api/v1/conversations/:id/calls',{preHandler:mutation},async(req,reply)=>{
    const cid=(req.params as {id:string}).id,uid=(req as AuthRequest).identity!.user.id;
    const body=req.body as {clientId?:unknown;mode?:unknown}|undefined;
    if(!uuid.test(cid))return invalid(reply,404,'NOT_FOUND','Conversation indisponible');
    if(!body||Object.keys(body).some(k=>!['clientId','mode'].includes(k))||typeof body.clientId!=='string'||!uuid.test(body.clientId)||typeof body.mode!=='string'||!['audio','video'].includes(body.mode))return invalid(reply,400,'VALIDATION_ERROR','Appel invalide');
    const result=await repo.transaction(async client=>{
      const conversation=await client.query('select id from conversations where id=$1 and closed_at is null for update',[cid]);
      if(!conversation.rowCount)return {error:'not_found'} as const;
      const member=await client.query('select 1 from conversation_members where conversation_id=$1 and user_id=$2 and left_at is null for update',[cid,uid]);
      if(!member.rowCount)return {error:'not_found'} as const;
      const previous=(await client.query<CallRow>('select * from calls where conversation_id=$1 and initiator_id=$2 and client_id=$3',[cid,uid,body.clientId])).rows[0];
      if(previous)return previous.mode===body.mode?{call:previous,created:false} as const:{error:'idempotency'} as const;
      const open=await client.query("select 1 from calls where conversation_id=$1 and state<>'ended'",[cid]);
      if(open.rowCount)return {error:'conflict'} as const;
      const id=randomUUID();
      const call=(await client.query<CallRow>('insert into calls(id,conversation_id,initiator_id,client_id,mode,room_name) values($1,$2,$3,$4,$5,$6) returning *',[id,cid,uid,body.clientId,body.mode,`chatisen_${id}`])).rows[0];
      return {call,created:true} as const;
    });
    if('error' in result)return result.error==='not_found'?invalid(reply,404,'NOT_FOUND','Conversation indisponible'):invalid(reply,409,result.error==='idempotency'?'IDEMPOTENCY_CONFLICT':'CALL_IN_PROGRESS','Appel incompatible avec la demande');
    return reply.code(result.created?201:200).send(summary(result.call));
  });
  app.post('/api/v1/calls/:id/join',{preHandler:mutation},async(req,reply)=>{
    const id=(req.params as {id:string}).id,identity=(req as AuthRequest).identity!;
    if(!uuid.test(id))return invalid(reply,404,'NOT_FOUND','Appel indisponible');
    const key=process.env.LIVEKIT_API_KEY,secret=process.env.LIVEKIT_API_SECRET,url=process.env.LIVEKIT_URL;
    let parsed:URL|undefined;try{if(url)parsed=new URL(url);}catch{/* unavailable */}
    if(!key||!secret||!parsed||parsed.protocol!=='wss:'||parsed.username||parsed.password||parsed.hash)return invalid(reply,503,'DEPENDENCY_UNAVAILABLE','Service média indisponible');
    const admission=await repo.transaction(async client=>{
      // Share the conversation/member lock order with group mutations.
      const lookup=(await client.query<{conversation_id:string}>('select conversation_id from calls where id=$1',[id])).rows[0];if(!lookup)return {error:'not_found'} as const;
      const conversation=await client.query('select 1 from conversations where id=$1 and closed_at is null for update',[lookup.conversation_id]);if(!conversation.rowCount)return {error:'not_found'} as const;
      const member=await client.query('select 1 from conversation_members where conversation_id=$1 and user_id=$2 and left_at is null for update',[lookup.conversation_id,identity.user.id]);if(!member.rowCount)return {error:'not_found'} as const;
      const session=(await client.query<{expires_at:Date}>('select expires_at from sessions where id=$1 and revoked_at is null and expires_at>now() for update',[identity.session.id])).rows[0];if(!session)return {error:'unauthorized'} as const;
      const call=(await client.query<CallRow>('select * from calls where id=$1 for update',[id])).rows[0];if(!call||call.state==='ended')return {error:'conflict'} as const;
      const issuedAt=Math.floor(Date.now()/1000),expiresAt=Math.min(issuedAt+300,Math.floor(new Date(session.expires_at).getTime()/1000));
      if(expiresAt<=issuedAt)return {error:'unauthorized'} as const;
      const livekitIdentity=`${identity.user.id}_${identity.session.id}`;
      await client.query(`insert into call_participants(call_id,user_id,session_id,state,livekit_identity,admission_expires_at) values($1,$2,$3,'invited',$4,to_timestamp($5)) on conflict(call_id,user_id) do update set session_id=excluded.session_id,state='invited',livekit_identity=excluded.livekit_identity,admission_expires_at=excluded.admission_expires_at`,[id,identity.user.id,identity.session.id,livekitIdentity,expiresAt]);
      return {room:call.room_name,livekitIdentity,issuedAt,expiresAt} as const;
    });
    if('error' in admission)return admission.error==='not_found'?invalid(reply,404,'NOT_FOUND','Appel indisponible'):admission.error==='unauthorized'?invalid(reply,401,'UNAUTHORIZED','Session expirée'):invalid(reply,409,'CALL_ENDED','Appel terminé');
    reply.header('Cache-Control','no-store');
    return {callId:id,serverUrl:url,token:signAdmission(key,secret,admission.room,admission.livekitIdentity,admission.issuedAt,admission.expiresAt),expiresAt:new Date(admission.expiresAt*1000).toISOString()};
  });
  app.post('/api/v1/calls/:id/end',{preHandler:mutation},async(req,reply)=>{
    const id=(req.params as {id:string}).id,uid=(req as AuthRequest).identity!.user.id;
    if(!uuid.test(id))return invalid(reply,404,'NOT_FOUND','Appel indisponible');
    const result=await repo.transaction(async client=>{
      const lookup=(await client.query<{conversation_id:string}>('select conversation_id from calls where id=$1',[id])).rows[0];if(!lookup)return 'not_found';
      const conversation=await client.query('select 1 from conversations where id=$1 and closed_at is null for update',[lookup.conversation_id]);if(!conversation.rowCount)return 'not_found';
      const member=(await client.query<{role:string}>('select role from conversation_members where conversation_id=$1 and user_id=$2 and left_at is null for update',[lookup.conversation_id,uid])).rows[0];if(!member)return 'not_found';
      const call=(await client.query<CallRow>('select * from calls where id=$1 for update',[id])).rows[0];if(!call)return 'not_found';
      if(call.initiator_id!==uid&&member.role!=='owner')return 'forbidden';
      if(call.state!=='ended')await client.query("update calls set state='ended',ended_at=now() where id=$1",[id]);
      return 'ended';
    });
    if(result==='not_found')return invalid(reply,404,'NOT_FOUND','Appel indisponible');
    if(result==='forbidden')return invalid(reply,403,'FORBIDDEN','Action refusée');
    // Ending the database record does not disconnect participants already in LiveKit.
    return reply.code(204).send();
  });
}
