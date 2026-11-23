export type User={id:string,handle:string,displayName:string,passwordHash:string,createdAt:string};
export type Session={id:string,userId:string,tokenHash:string,csrfHash:string,createdAt:string,expiresAt:string,revokedAt?:string};
export type Conversation={id:string,type:'direct'|'group',title:string|null,ownerId:string|null,lastSeq:number,createdAt:string};
export type Member={conversationId:string,userId:string,role:'owner'|'member',joinedAt:string,leftAt?:string};
export type Message={id:string,conversationId:string,seq:number,senderId:string,text:string|null,attachmentId?:string,clientMessageId?:string,createdAt:string};
export type Call={id:string,conversationId:string,initiatorId:string,kind:'audio'|'video',status:'ringing'|'active'|'ended',roomName:string,createdAt:string,endedAt?:string};
