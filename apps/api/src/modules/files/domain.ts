import {Failure,invalid} from '../../platform/errors.js';

export const mediaTypes=['image/png','image/jpeg','application/pdf','text/plain'] as const;
export type MediaType=typeof mediaTypes[number];
export const maxBytes=25*1024*1024;
export const uploadSeconds=600;
export const downloadSeconds=120;

export type Declaration={fileName:string;mediaType:MediaType;size:number;sha256:string};

export function declaration(input:Record<string,unknown>):Declaration{
  const {fileName,mediaType,size,sha256}=input;
  if(typeof fileName!=='string'||!fileName.trim()||fileName.length>255||/[\u0000-\u001f\u007f/\\]/.test(fileName))throw invalid('Nom de fichier invalide');
  if(!mediaTypes.includes(mediaType as MediaType))throw new Failure('unsupported','Types acceptés : PNG, JPEG, PDF et texte');
  if(!Number.isInteger(size)||(size as number)<1)throw invalid('Taille invalide');
  if((size as number)>maxBytes)throw new Failure('too_large','Le fichier dépasse 25 Mio');
  if(typeof sha256!=='string'||!/^[0-9a-f]{64}$/.test(sha256))throw invalid('Empreinte SHA-256 invalide');
  return {fileName:fileName.trim(),mediaType:mediaType as MediaType,size:size as number,sha256};
}

/** Le contenu doit correspondre au type annoncé : le navigateur ne fait pas foi. */
export function matchesType(head:Buffer,type:MediaType){
  if(type==='image/png')return head.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(type==='image/jpeg')return head.length>=3&&head[0]===0xff&&head[1]===0xd8&&head[2]===0xff;
  if(type==='application/pdf')return head.subarray(0,5).toString('latin1')==='%PDF-';
  return !head.includes(0);
}
