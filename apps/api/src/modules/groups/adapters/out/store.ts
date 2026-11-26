import {iso,type Queryable,type Tx} from '../../../../platform/db.js';
import type {ConversationType,Role} from '../../domain.js';

export type ConversationRow={id:string;type:ConversationType;title:string|null;role:Role};

export async function visible(db:Queryable,conversationId:string,userId:string):Promise<ConversationRow|undefined>{
  return (await db.query<ConversationRow>(`select c.id,c.type,c.title,m.role from groups.conversations c
    join groups.members m on m.conversation_id=c.id
    where c.id=$1 and c.closed_at is null and m.user_id=$2 and m.left_at is null`,[conversationId,userId])).rows[0];
}
export async function page(db:Queryable,userId:string,cursor:string|undefined,limit:number){
  return (await db.query<ConversationRow>(`select c.id,c.type,c.title,m.role from groups.conversations c
    join groups.members m on m.conversation_id=c.id
    where m.user_id=$1 and m.left_at is null and c.closed_at is null and ($2::uuid is null or c.id>$2::uuid)
    order by c.id limit $3`,[userId,cursor??null,limit])).rows;
}
export async function members(db:Queryable,conversationId:string){
  return (await db.query<{user_id:string;role:Role;joined_at:Date}>(`select user_id,role,joined_at from groups.members
    where conversation_id=$1 and left_at is null order by joined_at,user_id`,[conversationId])).rows
    .map(row=>({userId:row.user_id,role:row.role,joinedAt:iso(row.joined_at)}));
}
export async function activeMemberIds(db:Queryable,conversationId:string){
  return (await db.query<{user_id:string}>('select user_id from groups.members where conversation_id=$1 and left_at is null',[conversationId])).rows.map(row=>row.user_id);
}
export async function lockConversation(tx:Tx,conversationId:string){
  return (await tx.query<{id:string;type:ConversationType;title:string|null}>('select id,type,title from groups.conversations where id=$1 and closed_at is null for update',[conversationId])).rows[0];
}
export async function lockMembership(tx:Tx,conversationId:string,userId:string){
  return (await tx.query<{role:Role}>('select role from groups.members where conversation_id=$1 and user_id=$2 and left_at is null for update',[conversationId,userId])).rows[0];
}
export async function insertDirect(tx:Tx,low:string,high:string){
  const inserted=(await tx.query<{id:string}>(`insert into groups.conversations(type,direct_user_low,direct_user_high) values('direct',$1,$2)
    on conflict(direct_user_low,direct_user_high) where type='direct' and closed_at is null do nothing returning id`,[low,high])).rows[0];
  if(inserted)return {id:inserted.id,created:true};
  const existing=(await tx.query<{id:string}>("select id from groups.conversations where type='direct' and direct_user_low=$1 and direct_user_high=$2 and closed_at is null",[low,high])).rows[0];
  return {id:existing.id,created:false};
}
export async function insertGroup(tx:Tx,title:string){
  return (await tx.query<{id:string}>("insert into groups.conversations(type,title) values('group',$1) returning id",[title])).rows[0].id;
}
/** Ajoute ou réintègre un membre. */
export async function putMember(tx:Tx,conversationId:string,userId:string,role:Role){
  await tx.query(`insert into groups.members(conversation_id,user_id,role) values($1,$2,$3)
    on conflict(conversation_id,user_id) do update set role=excluded.role,left_at=null,joined_at=now()
    where groups.members.left_at is not null`,[conversationId,userId,role]);
}
export async function setRole(tx:Tx,conversationId:string,userId:string,role:Role){await tx.query('update groups.members set role=$3 where conversation_id=$1 and user_id=$2',[conversationId,userId,role]);}
export async function leaveMember(tx:Tx,conversationId:string,userId:string){await tx.query('update groups.members set left_at=now() where conversation_id=$1 and user_id=$2',[conversationId,userId]);}
export async function setTitle(tx:Tx,conversationId:string,title:string){await tx.query('update groups.conversations set title=$2 where id=$1',[conversationId,title]);}
export async function close(tx:Tx,conversationId:string){await tx.query('update groups.conversations set closed_at=now() where id=$1',[conversationId]);}

/** Sérialise la première utilisation d'une clé : une ligne absente ne peut pas être verrouillée. */
export async function lockCommand(tx:Tx,userId:string,clientId:string){await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`${userId}:${clientId}`]);}
export async function command(tx:Tx,userId:string,clientId:string){
  return (await tx.query<{conversation_id:string;command_hash:Buffer}>('select conversation_id,command_hash from groups.creation_commands where user_id=$1 and client_id=$2',[userId,clientId])).rows[0];
}
export async function saveCommand(tx:Tx,userId:string,clientId:string,hash:Buffer,conversationId:string){
  await tx.query('insert into groups.creation_commands(user_id,client_id,command_hash,conversation_id) values($1,$2,$3,$4)',[userId,clientId,hash,conversationId]);
}
