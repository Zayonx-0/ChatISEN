import {randomUUID,randomBytes,createHash} from 'node:crypto';
import type {User,Session,Conversation,Member,Message,Call} from './types.js';
import {Pool} from 'pg';

export interface Store {
 users: Map<string,User>; sessions: Map<string,Session>; conversations: Map<string,Conversation>; members: Map<string,Member>; messages: Map<string,Message>; calls: Map<string,Call>; attachments: Map<string,{id:string,messageId:string,name:string,mime:string,size:number,sha256:string,data:Buffer}>; seq:number;
}
export const memory:Store={users:new Map(),sessions:new Map(),conversations:new Map(),members:new Map(),messages:new Map(),calls:new Map(),attachments:new Map(),seq:0};
export const key=(a:string,b:string)=>`${a}:${b}`;
export const now=()=>new Date().toISOString();
export const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export const id=()=>randomUUID();
export function addUser(handle:string,displayName:string,passwordHash:string):User{const u={id:id(),handle:handle.toLowerCase(),displayName,passwordHash,createdAt:now()};memory.users.set(u.id,u);return u;}
export function addSession(userId:string,ttlH=24){const raw=token();const s:Session={id:id(),userId,tokenHash:hash(raw),csrfHash:hash(raw+process.env.CSRF_SECRET),createdAt:now(),expiresAt:new Date(Date.now()+ttlH*3600000).toISOString()};memory.sessions.set(s.id,s);return {raw,s};}
export function findSession(raw?:string){if(!raw)return;const h=hash(raw);for(const s of memory.sessions.values())if(s.tokenHash===h&&!s.revokedAt&&s.expiresAt>now())return s;}
export function createConversation(type:'direct'|'group',title:string|null,ownerId:string,otherIds:string[]=[]){if(type==='direct'){const ids=[ownerId,...otherIds].sort();for(const c of memory.conversations.values()){if(c.type==='direct'){const ms=[...memory.members.values()].filter(m=>m.conversationId===c.id&&!m.leftAt).map(m=>m.userId).sort();if(ms.join(',')===ids.join(','))return c;}}}const c:Conversation={id:id(),type,title:type==='group'?(title||'Groupe'):null,ownerId:type==='group'?ownerId:null,lastSeq:0,createdAt:now()};memory.conversations.set(c.id,c);for(const uid of [ownerId,...otherIds])memory.members.set(key(c.id,uid),{conversationId:c.id,userId:uid,role:uid===ownerId?'owner':'member',joinedAt:now()});return c;}
export function isMember(cid:string,uid:string){const m=memory.members.get(key(cid,uid));return !!m&&!m.leftAt;}
export function appendMessage(cid:string,uid:string,text:string|null,clientMessageId?:string,attachmentId?:string){if(!isMember(cid,uid))throw new Error('forbidden');if(clientMessageId){const existing=[...memory.messages.values()].find(m=>m.conversationId===cid&&m.senderId===uid&&m.clientMessageId===clientMessageId);if(existing)return existing;}const c=memory.conversations.get(cid)!;c.lastSeq++;const m:Message={id:id(),conversationId:cid,seq:c.lastSeq,senderId:uid,text,clientMessageId,attachmentId,createdAt:now()};memory.messages.set(m.id,m);return m;}
export const listMessages=(cid:string,limit=50,before?:number)=>[...memory.messages.values()].filter(m=>m.conversationId===cid&&(!before||m.seq<before)).sort((a,b)=>a.seq-b.seq).slice(-limit);
export const pub=(cid:string)=>`conversation:${cid}`;
export class PgStore {pool:Pool; constructor(url:string){this.pool=new Pool({connectionString:url});} async ping(){await this.pool.query('select 1');}}
