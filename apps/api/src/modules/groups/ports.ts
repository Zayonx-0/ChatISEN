import type {Queryable,Tx} from '../../platform/db.js';
import type {ConversationType,Role} from './domain.js';

export type Membership={type:ConversationType;role:Role};

/** Contrôle d'accès offert aux modules situés plus haut. */
export interface AccessPolicy{
  /**
   * Verrouille la conversation puis l'appartenance jusqu'à la fin de la transaction : un retrait
   * concurrent attend, ou bien l'écriture est refusée. Tous les modules prennent ces verrous
   * dans cet ordre.
   */
  lockMember(tx:Tx,conversationId:string,userId:string):Promise<Membership|undefined>;
  membership(conversationId:string,userId:string,db?:Queryable):Promise<Membership|undefined>;
  memberIds(conversationId:string,db?:Queryable):Promise<string[]>;
  /** Prévient les autres membres que leur liste de conversations a changé. */
  notifyMembers(db:Queryable,conversationId:string,exceptUserId:string|null,reason:'message'|'conversation',extra?:string[]):Promise<void>;
}
