import type {FastifyInstance,FastifyRequest} from 'fastify';
import {PostgresRepository,type PostgresMessage} from '../repositories/postgres.js';
import {postgresAuthenticator,invalid,type AuthRequest} from '../identity/postgres-routes.js';
import {csrfOk} from '../security.js';
import {GroupOperations,GroupOperationError} from './group-operations.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const seq=/^(0|[1-9][0-9]*)$/;
const iso=(value:Date|string)=>new Date(value).toISOString();
const messageDto=(m:PostgresMessage)=>({id:m.id,conversationId:m.conversationId,seq:m.seq,senderId:m.senderId,clientId:m.clientMessageId,createdAt:m.createdAt,text:m.text});

/** Incremental v1 HTTP chat routes; WebSocket catch-up is not yet wired. */
export async function registerPostgresChat(app:FastifyInstance,repo:PostgresRepository){
  const authenticate=postgresAuthenticator(repo);const groups=new GroupOperations(repo);
  const mutation=async(req:AuthRequest,reply:any)=>{await authenticate(req,reply);if(reply.sent)return;
    if(!process.env.CORS_ORIGIN||req.headers.origin!==process.env.CORS_ORIGIN)return invalid(reply,403,'ORIGIN_DENIED','Origine refusée');
    if(!csrfOk(req.identity!.token,String(req.headers['x-csrf-token']||'')))return invalid(reply,403,'CSRF_FAILED','Jeton CSRF invalide');
  };
  const detail=async(cid:string,uid:string)=>{
    const rows=await repo.pool.query(`select c.id,c.type,c.title,c.last_seq,c.updated_at,m.role from conversations c join conversation_members m on m.conversation_id=c.id where c.id=$1 and c.closed_at is null and m.user_id=$2 and m.left_at is null`,[cid,uid]);
    const row=rows.rows[0];if(!row)return undefined;
    const members=await repo.pool.query(`select u.id,u.handle,u.display_name,m.role,m.joined_at from conversation_members m join users u on u.id=m.user_id where m.conversation_id=$1 and m.left_at is null order by m.joined_at,u.id`,[cid]);
    return {id:row.id,type:row.type,title:row.title,lastSeq:String(row.last_seq),role:row.role,updatedAt:iso(row.updated_at),members:members.rows.map(m=>({user:{id:m.id,handle:m.handle,displayName:m.display_name},role:m.role,joinedAt:iso(m.joined_at)}))};
  };
  app.get('/api/v1/conversations',{preHandler:authenticate},async(req,reply)=>{
    const uid=(req as AuthRequest).identity!.user.id;const query=req.query as {cursor?:string;limit?:string};const limit=query.limit===undefined?50:Number(query.limit);
    if(!Number.isInteger(limit)||limit<1||limit>100||(query.cursor!==undefined&&!uuid.test(query.cursor)))return invalid(reply,400,'VALIDATION_ERROR','Pagination invalide');
    const rows=await repo.pool.query(`select c.id,c.type,c.title,c.last_seq,c.updated_at,m.role from conversations c join conversation_members m on m.conversation_id=c.id where m.user_id=$1 and m.left_at is null and c.closed_at is null and ($2::uuid is null or c.id>$2::uuid) order by c.id limit $3`,[uid,query.cursor??null,limit+1]);
    const hasMore=rows.rows.length>limit;const page=rows.rows.slice(0,limit);
    return {items:page.map(row=>({id:row.id,type:row.type,title:row.title,lastSeq:String(row.last_seq),role:row.role,updatedAt:iso(row.updated_at)})),nextCursor:hasMore?page[page.length-1].id:null};
  });
  app.get('/api/v1/conversations/:id',{preHandler:authenticate},async(req,reply)=>{
    const uid=(req as AuthRequest).identity!.user.id;const cid=(req.params as {id:string}).id;
    if(!uuid.test(cid))return invalid(reply,404,'NOT_FOUND','Conversation indisponible');
    return await detail(cid,uid)??invalid(reply,404,'NOT_FOUND','Conversation indisponible');
  });
  app.post('/api/v1/conversations/groups',{preHandler:mutation},async(req,reply)=>{
    const uid=(req as AuthRequest).identity!.user.id;const body=req.body as {clientId?:unknown;title?:unknown;memberIds?:unknown}|undefined;
    if(typeof body?.clientId!=='string'||!uuid.test(body.clientId)||typeof body.title!=='string'||!body.title.trim()||body.title.trim().length>120||!Array.isArray(body.memberIds)||body.memberIds.length<1||body.memberIds.length>99||body.memberIds.some(x=>typeof x!=='string'||!uuid.test(x)))return invalid(reply,400,'VALIDATION_ERROR','Groupe invalide');
    const members=(body.memberIds as string[]).map(x=>x.toLowerCase());
    if(members.includes(uid)||new Set(members).size!==members.length)return invalid(reply,400,'VALIDATION_ERROR','Groupe invalide');const found=await repo.pool.query('select id from users where id=any($1::uuid[])',[members]);
    if(found.rowCount!==members.length)return invalid(reply,404,'NOT_FOUND','Utilisateur indisponible');
    try{const group=await repo.createGroupIdempotent(uid,body.title.trim(),members,body.clientId);const result=await detail(group.id,uid);if(!result)return invalid(reply,404,'NOT_FOUND','Conversation indisponible');return reply.code(group.created?201:200).send(result);}
    catch(error){if((error as Error).message==='idempotency_conflict')return invalid(reply,409,'IDEMPOTENCY_CONFLICT','Clé déjà utilisée');if((error as Error).message==='forbidden')return invalid(reply,404,'NOT_FOUND','Conversation indisponible');throw error;}
  });
  const groupFailure=(error:unknown,reply:any)=>{
    if(!(error instanceof GroupOperationError))throw error;
    if(error.kind==='forbidden')return invalid(reply,403,'FORBIDDEN','Action réservée au propriétaire');
    if(error.kind==='conflict')return invalid(reply,409,'CONFLICT','Action incompatible avec l’état du groupe');
    return invalid(reply,404,'NOT_FOUND','Ressource indisponible');
  };
  app.patch('/api/v1/conversations/:id',{preHandler:mutation},async(req,reply)=>{
    const cid=(req.params as {id:string}).id,body=req.body as {title?:unknown}|undefined,uid=(req as AuthRequest).identity!.user.id;
    if(!uuid.test(cid))return invalid(reply,404,'NOT_FOUND','Conversation indisponible');
    if(typeof body?.title!=='string'||!body.title.trim()||body.title.trim().length>120)return invalid(reply,400,'VALIDATION_ERROR','Titre invalide');
    try{await groups.rename(cid,uid,body.title.trim());return await detail(cid,uid);}catch(error){return groupFailure(error,reply);}
  });
  app.post('/api/v1/conversations/:id/members/:userId',{preHandler:mutation},async(req,reply)=>{
    const {id:cid,userId}=req.params as {id:string;userId:string};const uid=(req as AuthRequest).identity!.user.id;
    if(!uuid.test(cid)||!uuid.test(userId))return invalid(reply,404,'NOT_FOUND','Ressource indisponible');
    try{const created=await groups.add(cid,uid,userId.toLowerCase());return reply.code(created?201:200).send(await detail(cid,uid));}catch(error){return groupFailure(error,reply);}
  });
  app.delete('/api/v1/conversations/:id/members/:userId',{preHandler:mutation},async(req,reply)=>{
    const {id:cid,userId}=req.params as {id:string;userId:string};const uid=(req as AuthRequest).identity!.user.id;
    if(!uuid.test(cid)||!uuid.test(userId))return invalid(reply,404,'NOT_FOUND','Ressource indisponible');
    try{await groups.remove(cid,uid,userId.toLowerCase());return reply.code(204).send();}catch(error){return groupFailure(error,reply);}
  });
  app.post('/api/v1/conversations/:id/transfer',{preHandler:mutation},async(req,reply)=>{
    const cid=(req.params as {id:string}).id,uid=(req as AuthRequest).identity!.user.id,body=req.body as {newOwnerId?:unknown}|undefined;
    if(!uuid.test(cid))return invalid(reply,404,'NOT_FOUND','Conversation indisponible');
    if(typeof body?.newOwnerId!=='string'||!uuid.test(body.newOwnerId))return invalid(reply,400,'VALIDATION_ERROR','Membre invalide');
    try{await groups.transfer(cid,uid,body.newOwnerId.toLowerCase());return await detail(cid,uid);}catch(error){return groupFailure(error,reply);}
  });
  app.post('/api/v1/conversations/:id/leave',{preHandler:mutation},async(req,reply)=>{
    const cid=(req.params as {id:string}).id,uid=(req as AuthRequest).identity!.user.id;
    if(!uuid.test(cid))return invalid(reply,404,'NOT_FOUND','Conversation indisponible');
    try{await groups.leave(cid,uid);return reply.code(204).send();}catch(error){return groupFailure(error,reply);}
  });
  app.get('/api/v1/users',{preHandler:authenticate},async(req,reply)=>{
    const handle=(req.query as {handle?:unknown}).handle;
    if(typeof handle!=='string'||!/^[a-z0-9_]{3,32}$/.test(handle))return invalid(reply,400,'VALIDATION_ERROR','Identifiant invalide');
    const user=await repo.findUserByHandle(handle);if(!user)return invalid(reply,404,'NOT_FOUND','Utilisateur indisponible');
    return {id:user.id,handle:user.handle,displayName:user.displayName};
  });
  app.post('/api/v1/conversations/direct',{preHandler:mutation},async(req,reply)=>{
    const uid=(req as AuthRequest).identity!.user.id;const body=req.body as {peerId?:unknown}|undefined;const peerId=body?.peerId;
    if(typeof peerId!=='string'||!uuid.test(peerId)||peerId===uid)return invalid(reply,400,'VALIDATION_ERROR','Destinataire invalide');
    if(!await repo.findUserById(peerId))return invalid(reply,404,'NOT_FOUND','Utilisateur indisponible');
    const conversation=await repo.createDirectConversation(uid,peerId);
    const result=await detail(conversation.id,uid);if(!result)return invalid(reply,404,'NOT_FOUND','Conversation indisponible');
    return reply.code(conversation.created?201:200).send(result);
  });
  app.get('/api/v1/conversations/:id/messages',{preHandler:authenticate},async(req,reply)=>{
    const uid=(req as AuthRequest).identity!.user.id;const cid=(req.params as {id:string}).id;
    if(!uuid.test(cid)||!await repo.isMember(cid,uid))return invalid(reply,404,'NOT_FOUND','Conversation indisponible');
    const query=req.query as {beforeSeq?:string;limit?:string};const limit=query.limit===undefined?50:Number(query.limit);
    if(!Number.isInteger(limit)||limit<1||limit>100||(query.beforeSeq!==undefined&&(!seq.test(query.beforeSeq)||query.beforeSeq.length>19||BigInt(query.beforeSeq)>9223372036854775807n)))return invalid(reply,400,'VALIDATION_ERROR','Pagination invalide');
    const items=await repo.listMessages(cid,limit,query.beforeSeq);
    return {items:items.map(messageDto),nextBeforeSeq:items.length===limit?items[0].seq:null};
  });
  app.get('/api/v1/conversations/:id/events',{preHandler:authenticate},async(req,reply)=>{
    const uid=(req as AuthRequest).identity!.user.id;const cid=(req.params as {id:string}).id;
    if(!uuid.test(cid)||!await repo.isMember(cid,uid))return invalid(reply,404,'NOT_FOUND','Conversation indisponible');
    const query=req.query as {afterSeq?:string;limit?:string};const after=query.afterSeq??'0';const limit=query.limit===undefined?50:Number(query.limit);
    if(!Number.isInteger(limit)||limit<1||limit>100||!seq.test(after)||after.length>19||BigInt(after)>9223372036854775807n)return invalid(reply,400,'VALIDATION_ERROR','Pagination invalide');
    const rows=await repo.pool.query(`select e.seq,e.event_type,e.payload,e.occurred_at from conversation_events e join conversation_members m on m.conversation_id=e.conversation_id and m.user_id=$2 and m.left_at is null where e.conversation_id=$1 and e.seq>$3 order by e.seq asc limit $4`,[cid,uid,after,limit+1]);
    const hasMore=rows.rows.length>limit;const visible=rows.rows.slice(0,limit);
    const items=visible.map(row=>{const data={...row.payload};if(data.messageId&&!data.id){data.id=data.messageId;delete data.messageId;}return {v:1,type:'event',conversationId:cid,seq:String(row.seq),at:iso(row.occurred_at),event:row.event_type,data};});
    return {items,nextAfterSeq:items.length?items[items.length-1].seq:null,hasMore};
  });
  app.post('/api/v1/conversations/:id/messages',{preHandler:mutation},async(req,reply)=>{
    const uid=(req as AuthRequest).identity!.user.id;const cid=(req.params as {id:string}).id;const body=req.body as {clientId?:unknown;text?:unknown}|undefined;
    if(!uuid.test(cid)||!await repo.isMember(cid,uid))return invalid(reply,404,'NOT_FOUND','Conversation indisponible');
    if(typeof body?.clientId!=='string'||!uuid.test(body.clientId)||typeof body.text!=='string'||!body.text.trim()||body.text.length>4000)return invalid(reply,400,'VALIDATION_ERROR','Message invalide');
    try{const result=await repo.appendMessage(cid,uid,body.text,body.clientId);return reply.code(result.created?201:200).send(messageDto(result.message));}
    catch(error){if((error as Error).message==='idempotency_conflict')return invalid(reply,409,'IDEMPOTENCY_CONFLICT','Clé déjà utilisée');if(['forbidden','conversation_not_found'].includes((error as Error).message))return invalid(reply,404,'NOT_FOUND','Conversation indisponible');throw error;}
  });
}
