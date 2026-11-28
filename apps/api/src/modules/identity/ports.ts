import type {Queryable} from '../../platform/db.js';

export type PublicUser={id:string;handle:string;displayName:string};

/** Annuaire : les autres modules obtiennent les profils publics sans lire le schéma identity. */
export interface UserDirectory{
  find(userId:string,db?:Queryable):Promise<PublicUser|undefined>;
  findMany(userIds:string[],db?:Queryable):Promise<Map<string,PublicUser>>;
}

export type AuditEntry={actorId:string;action:string;targetType:'user'|'conversation'|'server';targetId:string;detail?:Record<string,unknown>};
export type AuditFilter={beforeId?:string;action?:string;targetType?:AuditEntry['targetType']};
/** Journal d'audit, écrit dans la transaction de l'action qu'il décrit. */
export interface AuditTrail{record(db:Queryable,entry:AuditEntry):Promise<void>}
