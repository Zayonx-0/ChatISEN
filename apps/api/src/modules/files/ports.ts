import type {Tx} from '../../platform/db.js';
import type {MediaType} from './domain.js';

export type StoredObject={size:number;mediaType:string;sha256:string;head:Buffer};

/** Port sortant vers l'Object Storage. Les octets ne passent pas par l'API à l'envoi. */
export interface ObjectStore{
  signUpload(key:string,mediaType:MediaType,size:number,seconds:number):Promise<{url:string;headers:Record<string,string>}>;
  signDownload(key:string,fileName:string,seconds:number):Promise<string>;
  /** Relit l'objet pour le contrôler. Rend undefined s'il n'existe pas. */
  inspect(key:string,maxBytes:number):Promise<StoredObject|undefined>;
  remove(key:string):Promise<void>;
}

export interface FileCatalog{
  /** Un message ne joint qu'un fichier disponible, envoyé par son auteur dans la même conversation. */
  attachable(tx:Tx,fileId:string,conversationId:string,userId:string):Promise<boolean>;
}
