import {iso,type Queryable} from '../../../../platform/db.js';
import type {SessionUser} from '../../../../platform/http.js';
import type {GlobalRole} from '../../domain.js';
import type {AuditEntry,PublicUser} from '../../ports.js';

const columns='id,handle,display_name,global_role,created_at';
type UserRow={id:string;handle:string;display_name:string;global_role:GlobalRole;created_at:Date};
const toUser=(row:UserRow):SessionUser=>({id:row.id,handle:row.handle,displayName:row.display_name,globalRole:row.global_role,createdAt:iso(row.created_at)});
const toPublic=(row:{id:string;handle:string;display_name:string}):PublicUser=>({id:row.id,handle:row.handle,displayName:row.display_name});

export async function insertUser(db:Queryable,handle:string,name:string,passwordHash:string){
  return toUser((await db.query(`insert into identity.users(handle,display_name,password_hash) values($1,$2,$3) returning ${columns}`,[handle,name,passwordHash])).rows[0]);
}
export async function credentials(db:Queryable,handle:string){
  const row=(await db.query(`select ${columns},password_hash,disabled_at from identity.users where handle=$1`,[handle])).rows[0];
  return row?{user:toUser(row),passwordHash:row.password_hash as string,disabled:Boolean(row.disabled_at)}:undefined;
}
export async function userById(db:Queryable,id:string){
  const row=(await db.query(`select ${columns},disabled_at from identity.users where id=$1`,[id])).rows[0];
  return row?{user:toUser(row),disabled:Boolean(row.disabled_at)}:undefined;
}
export async function publicUsers(db:Queryable,ids:string[]){
  const rows=(await db.query('select id,handle,display_name from identity.users where id=any($1::uuid[])',[ids])).rows;
  return new Map(rows.map(row=>[row.id as string,toPublic(row)]));
}
/** Recherche par début d'identifiant ou par fragment du nom ; les comptes désactivés sont masqués. */
export async function searchUsers(db:Queryable,query:string,limit:number){
  const escaped=query.replace(/[\\%_]/g,'\\$&');
  const rows=(await db.query(`select id,handle,display_name from identity.users
    where disabled_at is null and (handle like lower($1)||'%' or display_name ilike '%'||$1||'%')
    order by (handle=lower($2)) desc,handle limit $3`,[escaped,query,limit])).rows;
  return rows.map(toPublic);
}
export async function renameUser(db:Queryable,id:string,name:string){
  return toUser((await db.query(`update identity.users set display_name=$2 where id=$1 returning ${columns}`,[id,name])).rows[0]);
}
export async function setRole(db:Queryable,id:string,role:GlobalRole){await db.query('update identity.users set global_role=$2 where id=$1',[id,role]);}
export async function setDisabled(db:Queryable,id:string,disabled:boolean){
  await db.query('update identity.users set disabled_at=case when $2 then coalesce(disabled_at,now()) end where id=$1',[id,disabled]);
}

export async function setPasswordHash(db:Queryable,id:string,hash:string){await db.query('update identity.users set password_hash=$2 where id=$1',[id,hash]);}

export async function insertSession(db:Queryable,userId:string,hash:Buffer,hours:number){
  await db.query(`insert into identity.sessions(user_id,token_hash,expires_at,absolute_expires_at)
    values($1,$2,now()+make_interval(hours=>$3),now()+make_interval(hours=>$3))`,[userId,hash,hours]);
}
export async function sessionByHash(db:Queryable,hash:Buffer){
  const row=(await db.query(`select s.id as session_id,s.expires_at,u.id,u.handle,u.display_name,u.global_role,u.created_at
    from identity.sessions s join identity.users u on u.id=s.user_id
    where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and u.disabled_at is null`,[hash])).rows[0];
  return row?{user:toUser(row),session:{id:row.session_id as string,expiresAt:iso(row.expires_at)}}:undefined;
}
export async function activeSessions(db:Queryable,ids:string[]){
  const rows=(await db.query(`select s.id from identity.sessions s join identity.users u on u.id=s.user_id
    where s.id=any($1::uuid[]) and s.revoked_at is null and s.expires_at>now() and u.disabled_at is null`,[ids])).rows;
  return new Set(rows.map(row=>row.id as string));
}
export async function revokeSession(db:Queryable,id:string){await db.query('update identity.sessions set revoked_at=now() where id=$1 and revoked_at is null',[id]);}
export async function revokeUserSessions(db:Queryable,userId:string){
  return (await db.query('update identity.sessions set revoked_at=now() where user_id=$1 and revoked_at is null returning id',[userId])).rows.map(row=>row.id as string);
}

export async function insertAudit(db:Queryable,entry:AuditEntry){
  await db.query('insert into identity.audit_log(actor_id,action,target_type,target_id,detail) values($1,$2,$3,$4,$5::jsonb)',
    [entry.actorId,entry.action,entry.targetType,entry.targetId,JSON.stringify(entry.detail??{})]);
}
export async function auditEntries(db:Queryable,limit:number,beforeId?:string){
  const rows=(await db.query(`select id,actor_id,action,target_type,target_id,detail,occurred_at from identity.audit_log
    where $2::bigint is null or id<$2::bigint order by id desc limit $1`,[limit,beforeId??null])).rows;
  return rows.map(row=>({id:String(row.id),actorId:row.actor_id,action:row.action,targetType:row.target_type,targetId:row.target_id,detail:row.detail,at:iso(row.occurred_at)}));
}
