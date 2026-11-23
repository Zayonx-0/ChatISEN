import {Pool, type PoolClient, type QueryResultRow} from 'pg';
import {randomUUID} from 'node:crypto';
import type {Conversation, Member, Message, Session, User} from '../types.js';

type DbUser=QueryResultRow&{id:string;handle:string;display_name:string;password_hash:string;created_at:Date|string};
type DbSession=QueryResultRow&{id:string;user_id:string;token_hash:Buffer|string;created_at:Date|string;expires_at:Date|string;revoked_at:Date|string|null};
type DbConversation=QueryResultRow&{id:string;type:'direct'|'group';title:string|null;last_seq:string|number;created_at:Date|string};
type DbMessage=QueryResultRow&{id:string;conversation_id:string;seq:string|number;sender_id:string;text:string|null;client_id:string;created_at:Date|string};

const iso=(v:Date|string)=>v instanceof Date?v.toISOString():new Date(v).toISOString();
const buf=(v:string|Buffer)=>Buffer.isBuffer(v)?v:Buffer.from(v,'hex');

/** PostgreSQL-backed identity/chat repository. All message writes are atomic. */
export class PostgresRepository {
  readonly pool:Pool;
  constructor(poolOrUrl:Pool|string){this.pool=typeof poolOrUrl==='string'?new Pool({connectionString:poolOrUrl}):poolOrUrl;}
  async close(){await this.pool.end();}
  async ping(){await this.pool.query('select 1');}
  async transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();
    try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK');throw error}
    finally{client.release()}
  }
  async createUser(handle:string,displayName:string,passwordHash:string):Promise<User>{
    const row=(await this.pool.query<DbUser>('insert into users(handle,display_name,password_hash) values($1,$2,$3) returning id,handle,display_name,password_hash,created_at',[handle.toLowerCase(),displayName,passwordHash])).rows[0];
    return mapUser(row);
  }
  async findUserByHandle(handle:string):Promise<User|undefined>{
    const row=(await this.pool.query<DbUser>('select id,handle,display_name,password_hash,created_at from users where handle=$1',[handle.toLowerCase()])).rows[0];
    return row?mapUser(row):undefined;
  }
  async createSession(userId:string,tokenHash:string,ttlHours=24):Promise<Session>{
    const row=(await this.pool.query<DbSession>(`insert into sessions(user_id,token_hash,expires_at,absolute_expires_at) values($1,$2,now()+($3::text||' hours')::interval,now()+($3::text||' hours')::interval) returning id,user_id,token_hash,created_at,expires_at,revoked_at`,[userId,buf(tokenHash),ttlHours])).rows[0];
    return mapSession(row);
  }
  async findSession(tokenHash:string):Promise<Session|undefined>{
    const row=(await this.pool.query<DbSession>('select id,user_id,token_hash,created_at,expires_at,revoked_at from sessions where token_hash=$1 and revoked_at is null and expires_at>now()',[buf(tokenHash)])).rows[0];
    return row?mapSession(row):undefined;
  }
  async revokeSession(sessionId:string):Promise<boolean>{return (await this.pool.query('update sessions set revoked_at=now() where id=$1 and revoked_at is null',[sessionId])).rowCount===1;}
  async createDirectConversation(ownerId:string,otherId:string):Promise<Conversation>{
    const [low,high]=[ownerId,otherId].sort();
    return this.transaction(async client=>{
      const row=(await client.query<DbConversation>(`insert into conversations(type,direct_user_low,direct_user_high) values('direct',$1,$2) on conflict(direct_user_low,direct_user_high) where type='direct' and closed_at is null do update set updated_at=conversations.updated_at returning id,type,title,last_seq,created_at`,[low,high])).rows[0];
      await client.query(`insert into conversation_members(conversation_id,user_id,role) values($1,$2,'member'),($1,$3,'member') on conflict(conversation_id,user_id) do update set left_at=null`,[row.id,ownerId,otherId]);
      return mapConversation(row);
    });
  }
  async createGroupConversation(ownerId:string,title:string,memberIds:string[]=[]):Promise<Conversation>{
    return this.transaction(async client=>{
      const row=(await client.query<DbConversation>(`insert into conversations(type,title) values('group',$1) returning id,type,title,last_seq,created_at`,[title])).rows[0];
      const members=[...new Set([ownerId,...memberIds])];
      for(const uid of members)await client.query(`insert into conversation_members(conversation_id,user_id,role) values($1,$2,$3)`,[row.id,uid,uid===ownerId?'owner':'member']);
      return mapConversation(row);
    });
  }
  async isMember(conversationId:string,userId:string):Promise<boolean>{
    const row=(await this.pool.query('select 1 from conversation_members where conversation_id=$1 and user_id=$2 and left_at is null',[conversationId,userId])).rowCount;
    return row===1;
  }
  async listMessages(conversationId:string,limit=50,before?:string):Promise<Message[]>{
    const args:[string,number|string]=[conversationId,Math.min(100,Math.max(1,limit))];
    const beforeSql=before?' and seq < $3':''; if(before)args.push(before);
    const rows=(await this.pool.query<DbMessage>(`select id,conversation_id,seq,sender_id,text,client_id,created_at from messages where conversation_id=$1${beforeSql} order by seq desc limit $2`,args)).rows;
    return rows.reverse().map(mapMessage);
  }
  /** Inserts event and message under the conversation row lock; clientId retries are idempotent. */
  async appendMessage(conversationId:string,senderId:string,text:string,clientId:string):Promise<{message:Message;created:boolean}>{
    return this.transaction(async client=>{
      const existing=(await client.query<DbMessage>('select id,conversation_id,seq,sender_id,text,client_id,created_at from messages where conversation_id=$1 and sender_id=$2 and client_id=$3',[conversationId,senderId,clientId])).rows[0];
      if(existing)return {message:mapMessage(existing),created:false};
      const membership=await client.query('select 1 from conversation_members where conversation_id=$1 and user_id=$2 and left_at is null',[conversationId,senderId]);
      if(membership.rowCount!==1)throw new Error('forbidden');
      const c=(await client.query<{last_seq:string}>('select last_seq from conversations where id=$1 for update',[conversationId])).rows[0];
      if(!c)throw new Error('conversation_not_found');
      const seq=BigInt(c.last_seq)+1n;
      const messageId=randomUUID();
      const payload={messageId,conversationId,senderId,clientId,text};
      await client.query('update conversations set last_seq=$2,updated_at=now() where id=$1',[conversationId,seq.toString()]);
      await client.query(`insert into conversation_events(conversation_id,seq,event_type,entity_id,payload) values($1,$2,'message.created',$3,$4::jsonb)`,[conversationId,seq.toString(),messageId,JSON.stringify(payload)]);
      const row=(await client.query<DbMessage>('insert into messages(id,conversation_id,seq,sender_id,client_id,kind,text) values($1,$2,$3,$4,$5,\'text\',$6) returning id,conversation_id,seq,sender_id,text,client_id,created_at',[messageId,conversationId,seq.toString(),senderId,clientId,text])).rows[0];
      return {message:mapMessage(row),created:true};
    });
  }
}

function mapUser(row:DbUser):User{return {id:row.id,handle:row.handle,displayName:row.display_name,passwordHash:row.password_hash,createdAt:iso(row.created_at)}}
function mapSession(row:DbSession):Session{return {id:row.id,userId:row.user_id,tokenHash:Buffer.from(row.token_hash).toString('hex'),csrfHash:'',createdAt:iso(row.created_at),expiresAt:iso(row.expires_at),revokedAt:row.revoked_at?iso(row.revoked_at):undefined}}
function mapConversation(row:DbConversation):Conversation{return {id:row.id,type:row.type,title:row.title,ownerId:null,lastSeq:Number(row.last_seq),createdAt:iso(row.created_at)}}
function mapMessage(row:DbMessage):Message{return {id:row.id,conversationId:row.conversation_id,seq:Number(row.seq),senderId:row.sender_id,text:row.text,clientMessageId:row.client_id,createdAt:iso(row.created_at)}}
