import {iso,type Queryable} from '../../../../platform/db.js';
import type {Message} from '../../ports.js';

const columns='id,conversation_id,seq,sender_id,client_id,text,file_id,created_at';
type Row={id:string;conversation_id:string;seq:string;sender_id:string;client_id:string;text:string|null;file_id:string|null;created_at:Date};
const toMessage=(row:Row):Message=>({id:row.id,conversationId:row.conversation_id,seq:String(row.seq),senderId:row.sender_id,clientId:row.client_id,
  ...(row.text===null?{}:{text:row.text}),...(row.file_id===null?{}:{fileId:row.file_id}),createdAt:iso(row.created_at)});

export async function byClientId(db:Queryable,conversationId:string,senderId:string,clientId:string){
  const row=(await db.query<Row>(`select ${columns} from messaging.messages where conversation_id=$1 and sender_id=$2 and client_id=$3`,[conversationId,senderId,clientId])).rows[0];
  return row?toMessage(row):undefined;
}
export async function insert(db:Queryable,message:{id:string;conversationId:string;seq:string;senderId:string;clientId:string;text:string|null;fileId:string|null}){
  return toMessage((await db.query<Row>(`insert into messaging.messages(id,conversation_id,seq,sender_id,client_id,kind,text,file_id)
    values($1,$2,$3,$4,$5,case when $7::uuid is null then 'text' else 'file' end::messaging.message_kind,$6,$7) returning ${columns}`,
    [message.id,message.conversationId,message.seq,message.senderId,message.clientId,message.text,message.fileId])).rows[0]);
}
export async function latest(db:Queryable,conversationId:string,limit:number,beforeSeq?:string){
  const rows=(await db.query<Row>(`select ${columns} from messaging.messages where conversation_id=$1 and ($3::bigint is null or seq<$3::bigint)
    order by seq desc limit $2`,[conversationId,limit,beforeSeq??null])).rows;
  return rows.map(toMessage);
}

export async function referencesFile(db:Queryable,id:string){
  return Boolean((await db.query('select 1 from messaging.messages where file_id=$1',[id])).rowCount);
}
export async function dailyMessageCounts(db:Queryable):Promise<{day:string;count:number}[]>{
  const {rows}=await db.query(`with today as (select (now() at time zone 'UTC')::date as day),
    counts as (select (created_at at time zone 'UTC')::date as day,count(*) as total
      from messaging.messages where created_at>=((select day-6 from today)::timestamp at time zone 'UTC') group by 1)
    select to_char(today.day-offsets.n,'YYYY-MM-DD') as day,coalesce(total,0) as total
    from today cross join generate_series(6,0,-1) as offsets(n)
    left join counts on counts.day=today.day-offsets.n order by today.day-offsets.n`);
  return rows.map(row=>({day:row.day,count:Number(row.total)}));
}
