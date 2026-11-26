/** Matrice des droits du dossier d'architecture, sans Fastify ni SQL. */
export type Role='owner'|'moderator'|'member';
export type ConversationType='direct'|'group';
export const roles:Role[]=['owner','moderator','member'];
export const maxMembers=1000;

/** Ajouter un membre, renommer le groupe, nommer un modérateur et transférer : le propriétaire. */
export const canManage=(actor:Role)=>actor==='owner';
/** Un modérateur retire un membre simple ; le propriétaire retire tout autre que lui-même. */
export const canRemove=(actor:Role,target:Role)=>actor==='owner'?target!=='owner':actor==='moderator'&&target==='member';
