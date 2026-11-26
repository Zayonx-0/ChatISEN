export type Role='owner'|'moderator'|'member';
export type User={id:string;handle:string;displayName:string;createdAt?:string;csrfToken?:string;globalRole?:'user'|'admin'};
export type Member={user:User;role:Role;joinedAt:string};
export type Conversation={id:string;type:'direct'|'group';title:string|null;lastSeq:string;role:Role;updatedAt:string;members?:Member[]};
export type Message={id:string;conversationId:string;seq:string;senderId:string;clientId:string;text?:string;fileId?:string;createdAt:string};
export const roleNames:Record<Role,string>={owner:'Propriétaire',moderator:'Modérateur',member:'Membre'};
export const errorText=(error:unknown,fallback:string)=>error instanceof Error&&error.message?error.message:fallback;
