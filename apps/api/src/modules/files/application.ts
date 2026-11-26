import {randomUUID} from 'node:crypto';
import {iso,type Database,type Tx} from '../../platform/db.js';
import {conflict,Failure,notFound} from '../../platform/errors.js';
import {budget} from '../../platform/validation.js';
import type {AccessPolicy} from '../groups/index.js';
import * as store from './adapters/out/store.js';
import {downloadSeconds,matchesType,maxBytes,uploadSeconds,type Declaration,type MediaType} from './domain.js';
import type {FileCatalog,ObjectStore} from './ports.js';

const dto=(row:store.FileRow)=>({id:row.id,fileName:row.file_name,mediaType:row.media_type,size:row.size_bytes,state:row.state});
const expiry=(seconds:number)=>iso(new Date(Date.now()+seconds*1000));
const unknownFile=()=>notFound('Fichier indisponible');

export class FileService implements FileCatalog{
  private allowed=budget(20);
  constructor(private db:Database,private access:AccessPolicy,private objects:ObjectStore|undefined,private onError:(error:unknown)=>void=()=>{}){}

  private storage(){
    if(!this.objects)throw new Failure('unavailable','Le partage de fichiers n’est pas configuré');
    return this.objects;
  }
  private async signed<T>(sign:Promise<T>):Promise<T>{
    return sign.catch(error=>{this.onError(error);throw new Failure('unavailable','Le partage de fichiers est momentanément indisponible');});
  }
  attachable(tx:Tx,fileId:string,conversationId:string,userId:string){return store.attachable(tx,fileId,conversationId,userId);}

  async prepare(conversationId:string,userId:string,file:Declaration){
    if(!await this.access.membership(conversationId,userId))throw notFound('Conversation indisponible');
    const objects=this.storage();
    if(!this.allowed(userId)||await store.pendingCount(this.db.pool,userId)>=20)throw new Failure('rate_limited','Trop d’envois en attente');
    const id=randomUUID(),key=`conversations/${conversationId}/${id}`;
    const upload=await this.signed(objects.signUpload(key,file.mediaType,file.size,uploadSeconds));
    const row=await store.insert(this.db.pool,{id,conversation_id:conversationId,owner_id:userId,file_name:file.fileName,media_type:file.mediaType,size_bytes:file.size,sha256:Buffer.from(file.sha256,'hex'),object_key:key});
    return {file:dto(row),uploadUrl:upload.url,headers:upload.headers,expiresAt:expiry(uploadSeconds)};
  }

  private async visible(fileId:string,userId:string){
    const row=await store.byId(this.db.pool,fileId);
    if(!row||!await this.access.membership(row.conversation_id,userId))throw unknownFile();
    return row;
  }

  /** Confirme l'envoi : le serveur relit l'objet et contrôle taille, empreinte et type réel. */
  async complete(fileId:string,userId:string){
    const row=await this.visible(fileId,userId);
    if(row.owner_id!==userId)throw unknownFile();
    if(row.state==='available')return dto(row);
    if(row.state==='rejected')throw conflict('Fichier refusé','FILE_REJECTED');
    const objects=this.storage();
    const stored=await objects.inspect(row.object_key,maxBytes);
    if(!stored)throw conflict('Le fichier n’a pas été reçu','UPLOAD_MISSING');
    const genuine=stored.size===row.size_bytes&&stored.mediaType===row.media_type&&stored.sha256===row.sha256.toString('hex')&&matchesType(stored.head,row.media_type as MediaType);
    if(!genuine){
      await store.setState(this.db.pool,row.id,'rejected');
      await objects.remove(row.object_key);
      throw conflict('Le contenu reçu ne correspond pas à la déclaration','FILE_REJECTED');
    }
    return dto(await store.setState(this.db.pool,row.id,'available')??(await store.byId(this.db.pool,row.id)));
  }

  async download(fileId:string,userId:string){
    const row=await this.visible(fileId,userId);
    if(row.state!=='available')throw unknownFile();
    return {file:dto(row),downloadUrl:await this.signed(this.storage().signDownload(row.object_key,row.file_name,downloadSeconds)),expiresAt:expiry(downloadSeconds)};
  }

  async sweep(){
    if(!this.objects)return;
    for(const row of await store.abandoned(this.db.pool)){await this.objects.remove(row.object_key);await store.remove(this.db.pool,row.id);}
  }
}
