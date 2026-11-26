import React,{useEffect,useState} from 'react';
import {fileDownload,sizeText,type FileInfo} from './files.js';

/** Pièce jointe d'un message. L'URL de téléchargement, courte, est redemandée à chaque clic. */
export function Attachment({fileId}:{fileId:string}){
  const [file,setFile]=useState<FileInfo|null>(null);const [error,setError]=useState('');
  useEffect(()=>{let active=true;fileDownload(fileId).then(result=>{if(active)setFile(result.file);}).catch(()=>{if(active)setError('Pièce jointe indisponible');});return()=>{active=false;};},[fileId]);
  const download=async()=>{
    try{
      const {downloadUrl}=await fileDownload(fileId);
      const link=document.createElement('a');link.href=downloadUrl;link.rel='noopener noreferrer';link.click();
    }catch{setError('Téléchargement impossible');}
  };
  if(error)return <p className="attachment-error">{error}</p>;
  if(!file)return <p className="attachment-error">Pièce jointe…</p>;
  return <button type="button" className="attachment" onClick={()=>void download()} aria-label={`Télécharger ${file.fileName}`}>📎 <span>{file.fileName}</span><small>{sizeText(file.size)}</small></button>;
}
