import type {Queryable} from '../../../../platform/db.js';

export type FileRow={id:string;conversation_id:string;owner_id:string;file_name:string;media_type:string;size_bytes:number;sha256:Buffer;object_key:string;state:'pending'|'available'|'rejected'};

export async function insert(db:Queryable,row:Omit<FileRow,'state'>){
  return (await db.query<FileRow>(`insert into files.files(id,conversation_id,owner_id,file_name,media_type,size_bytes,sha256,object_key)
    values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[row.id,row.conversation_id,row.owner_id,row.file_name,row.media_type,row.size_bytes,row.sha256,row.object_key])).rows[0];
}
export async function byId(db:Queryable,id:string){return (await db.query<FileRow>('select * from files.files where id=$1',[id])).rows[0];}
export async function setState(db:Queryable,id:string,state:'available'|'rejected'){
  return (await db.query<FileRow>("update files.files set state=$2,completed_at=now() where id=$1 and state='pending' returning *",[id,state])).rows[0];
}
export async function pendingCount(db:Queryable,ownerId:string){return Number((await db.query("select count(*) from files.files where owner_id=$1 and state='pending'",[ownerId])).rows[0].count);}
export async function attachable(db:Queryable,id:string,conversationId:string,ownerId:string){
  return Boolean((await db.query(`update files.files set attached_at=now()
    where id=$1 and conversation_id=$2 and owner_id=$3 and state='available' and attached_at is null returning id`,
    [id,conversationId,ownerId])).rowCount);
}

const expired="attached_at is null and (case when state='available' then completed_at<now()-interval '24 hours' else created_at<now()-interval '1 hour' end)";
export async function abandoned(db:Queryable){
  return (await db.query<{id:string}>(`select id from files.files where ${expired} order by created_at limit 100`)).rows;
}

export async function lockAbandoned(db:Queryable,id:string){
  return (await db.query<{object_key:string}>(`select object_key from files.files where id=$1 and ${expired} for update skip locked`,[id])).rows[0];
}

export async function markAttached(db:Queryable,id:string){
  await db.query('update files.files set attached_at=now() where id=$1',[id]);
}

export async function reject(db:Queryable,id:string){
  await db.query("update files.files set state='rejected' where id=$1",[id]);
}

export async function removeRejected(db:Queryable,id:string){
  await db.query("delete from files.files where id=$1 and state='rejected' and attached_at is null",[id]);
}
