import {randomUUID} from 'node:crypto';
import type {Database,Tx} from '../../platform/db.js';
import {conflict,Failure,keyReused,notFound} from '../../platform/errors.js';
import {messages as persisted} from '../../platform/metrics.js';
import {appendEvent,publishOutbox,readEvents} from '../../platform/realtime.js';
import {budget} from '../../platform/validation.js';
import type {FileCatalog} from '../files/index.js';
import type {AccessPolicy} from '../groups/index.js';
import * as store from './adapters/out/store.js';
import type {Command} from './domain.js';
import type {MessageTimeline} from './ports.js';

const unavailable=()=>notFound('Conversation indisponible');

export class MessageService implements MessageTimeline{
  private allowed=budget(120);
  constructor(private db:Database,private access:AccessPolicy,private files:FileCatalog){}

  referencesFile(tx:Tx,id:string){return store.referencesFile(tx,id);}

  private async requireMember(conversationId:string,userId:string){if(!await this.access.membership(conversationId,userId))throw unavailable();}

  async list(conversationId:string,userId:string,limit:number,beforeSeq?:string){
    await this.requireMember(conversationId,userId);
    const items=await store.latest(this.db.pool,conversationId,limit,beforeSeq);
    return {items,nextBeforeSeq:items.length===limit?items[items.length-1].seq:null};
  }

  /** Rattrapage après une coupure : les événements strictement postérieurs au curseur. */
  async events(conversationId:string,userId:string,afterSeq:string,limit:number){
    await this.requireMember(conversationId,userId);
    const rows=await readEvents(this.db.pool,conversationId,afterSeq,limit+1);
    const items=rows.slice(0,limit).map(event=>({v:1,type:'event',conversationId,...event}));
    return {items,nextAfterSeq:items.length?items[items.length-1].seq:null,hasMore:rows.length>limit};
  }

  /** Droit, numéro, message, événement et outbox dans une seule transaction. */
  async post(conversationId:string,senderId:string,command:Command){
    return this.db.transaction(async tx=>{
      if(!await this.access.lockMember(tx,conversationId,senderId))throw unavailable();
      // Le verrou de conversation sérialise les reprises avant la lecture de la clé.
      const previous=await store.byClientId(tx,conversationId,senderId,command.clientId);
      if(previous){
        if((previous.text??null)!==command.text||(previous.fileId??null)!==command.fileId)throw keyReused();
        return {message:previous,created:false};
      }
      if(!this.allowed(senderId))throw new Failure('rate_limited','Trop de messages, patientez un instant');
      if(command.fileId&&!await this.files.attachable(tx,command.fileId,conversationId,senderId))throw conflict('Fichier indisponible','FILE_UNAVAILABLE');
      const id=randomUUID();
      const data={id,conversationId,senderId,clientId:command.clientId,...(command.text===null?{}:{text:command.text}),...(command.fileId===null?{}:{fileId:command.fileId})};
      const seq=await appendEvent(tx,conversationId,'message.created',id,data);
      const message=await store.insert(tx,{id,conversationId,seq,senderId,...command}).catch((error:{code?:string})=>{
        if(error.code==='23505')throw conflict('Ce fichier accompagne déjà un message','FILE_UNAVAILABLE');
        throw error;
      });
      await publishOutbox(tx,{type:'message.created',conversationId,actorId:senderId,entityId:id});
      await this.access.notifyMembers(tx,conversationId,senderId,'message');
      persisted.inc();
      return {message,created:true};
    });
  }
}
