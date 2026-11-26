export type Message={id:string;conversationId:string;seq:string;senderId:string;clientId:string;text?:string;fileId?:string;createdAt:string};

/** Historique des conversations, ordonné par le numéro du journal. */
export interface MessageTimeline{
  list(conversationId:string,userId:string,limit:number,beforeSeq?:string):Promise<{items:Message[];nextBeforeSeq:string|null}>;
}
