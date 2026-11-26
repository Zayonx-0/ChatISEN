import {api,write} from './api.js';

export type FileInfo={id:string;fileName:string;mediaType:string;size:number;state:'pending'|'available'|'rejected'};
export const acceptedTypes=['image/png','image/jpeg','application/pdf','text/plain'];
export const maxBytes=25*1024*1024;

const hex=(buffer:ArrayBuffer)=>[...new Uint8Array(buffer)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
export const sizeText=(size:number)=>size<1024?`${size} o`:size<1048576?`${Math.round(size/1024)} Kio`:`${(size/1048576).toFixed(1)} Mio`;

/**
 * Envoi direct vers l'Object Storage : l'API rend une URL signée, le navigateur y dépose
 * les octets, puis le serveur contrôle l'objet avant de le rendre utilisable.
 */
export async function uploadFile(conversationId:string,file:File,csrf:string):Promise<FileInfo>{
  if(!acceptedTypes.includes(file.type))throw new Error('Types acceptés : PNG, JPEG, PDF et texte.');
  if(!file.size||file.size>maxBytes)throw new Error('Le fichier doit peser entre 1 octet et 25 Mio.');
  const sha256=hex(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()));
  const prepared=await api<{file:FileInfo;uploadUrl:string;headers?:Record<string,string>}>(`/conversations/${conversationId}/files`,write(csrf,'POST',{fileName:file.name,mediaType:file.type,size:file.size,sha256}));
  const sent=await fetch(prepared.uploadUrl,{method:'PUT',headers:prepared.headers??{'content-type':file.type},body:file,credentials:'omit'});
  if(!sent.ok)throw new Error('Le stockage a refusé le fichier.');
  return api<FileInfo>(`/files/${prepared.file.id}`,write(csrf,'PATCH',{state:'available'}));
}

export const fileDownload=(id:string)=>api<{file:FileInfo;downloadUrl:string}>(`/files/${id}`);
