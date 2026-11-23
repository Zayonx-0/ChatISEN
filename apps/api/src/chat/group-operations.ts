import type {PoolClient} from 'pg';
import {PostgresRepository} from '../repositories/postgres.js';

type GroupRow={id:string;title:string;type:string};
export class GroupOperationError extends Error {constructor(readonly kind:'not_found'|'forbidden'|'conflict'){super(kind);}}
async function lockGroup(client:PoolClient,cid:string,actor:string,ownerRequired:boolean):Promise<GroupRow>{
  const group=(await client.query<GroupRow>(`select id,title,type from conversations where id=$1 and closed_at is null for update`,[cid])).rows[0];
  if(!group||group.type!=='group')throw new GroupOperationError('not_found');
  const member=(await client.query<{role:string}>(`select role from conversation_members where conversation_id=$1 and user_id=$2 and left_at is null for update`,[cid,actor])).rows[0];
  if(!member)throw new GroupOperationError('not_found');
  if(ownerRequired&&member.role!=='owner')throw new GroupOperationError('forbidden');
  return group;
}
async function event(client:PoolClient,cid:string,type:string,data:Record<string,unknown>){
  const row=(await client.query<{last_seq:string}>('update conversations set last_seq=last_seq+1,updated_at=now() where id=$1 returning last_seq',[cid])).rows[0];
  await client.query('insert into conversation_events(conversation_id,seq,event_type,entity_id,payload) values($1,$2,$3,$1,$4::jsonb)',[cid,row.last_seq,type,JSON.stringify(data)]);
}
/** All group mutations use the same conversation-first locking order as messages. */
export class GroupOperations {
  constructor(private readonly repo:PostgresRepository){}
  rename(cid:string,actor:string,title:string){return this.repo.transaction(async client=>{const group=await lockGroup(client,cid,actor,true);if(group.title===title)return;await client.query('update conversations set title=$2 where id=$1',[cid,title]);await event(client,cid,'conversation.renamed',{title,actorId:actor});});}
  add(cid:string,actor:string,target:string){return this.repo.transaction(async client=>{
    await lockGroup(client,cid,actor,true);
    const user=await client.query('select 1 from users where id=$1',[target]);if(!user.rowCount)throw new GroupOperationError('not_found');
    const existing=(await client.query<{left_at:Date|null}>('select left_at from conversation_members where conversation_id=$1 and user_id=$2 for update',[cid,target])).rows[0];
    if(existing&&!existing.left_at)return false;
    const count=(await client.query<{count:string}>('select count(*) from conversation_members where conversation_id=$1 and left_at is null',[cid])).rows[0];
    if(Number(count.count)>=1000)throw new GroupOperationError('conflict');
    await client.query(`insert into conversation_members(conversation_id,user_id,role) values($1,$2,'member') on conflict(conversation_id,user_id) do update set role='member',left_at=null,joined_at=now()`,[cid,target]);
    await event(client,cid,'conversation.member_added',{userId:target,actorId:actor});return true;
  });}
  remove(cid:string,actor:string,target:string){return this.repo.transaction(async client=>{
    await lockGroup(client,cid,actor,true);if(target===actor)throw new GroupOperationError('conflict');
    const removed=await client.query(`update conversation_members set left_at=now() where conversation_id=$1 and user_id=$2 and left_at is null returning user_id`,[cid,target]);
    if(!removed.rowCount)throw new GroupOperationError('not_found');
    await event(client,cid,'conversation.member_removed',{userId:target,actorId:actor});
  });}
  transfer(cid:string,actor:string,target:string){return this.repo.transaction(async client=>{
    await lockGroup(client,cid,actor,true);if(target===actor)throw new GroupOperationError('conflict');
    const member=await client.query(`select 1 from conversation_members where conversation_id=$1 and user_id=$2 and left_at is null for update`,[cid,target]);
    if(!member.rowCount)throw new GroupOperationError('not_found');
    await client.query(`update conversation_members set role='member' where conversation_id=$1 and user_id=$2`,[cid,actor]);
    await client.query(`update conversation_members set role='owner' where conversation_id=$1 and user_id=$2`,[cid,target]);
    await event(client,cid,'conversation.owner_transferred',{newOwnerId:target,actorId:actor});
  });}
  leave(cid:string,actor:string){return this.repo.transaction(async client=>{
    await lockGroup(client,cid,actor,false);
    const role=(await client.query<{role:string}>('select role from conversation_members where conversation_id=$1 and user_id=$2',[cid,actor])).rows[0].role;
    const count=(await client.query<{count:string}>('select count(*) from conversation_members where conversation_id=$1 and left_at is null',[cid])).rows[0];
    if(role==='owner'&&Number(count.count)>1)throw new GroupOperationError('conflict');
    await client.query('update conversation_members set left_at=now() where conversation_id=$1 and user_id=$2',[cid,actor]);
    await event(client,cid,role==='owner'?'conversation.closed':'conversation.member_left',{userId:actor});
    if(role==='owner')await client.query('update conversations set closed_at=now() where id=$1',[cid]);
  });}
}
