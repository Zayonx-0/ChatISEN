import {invalid} from '../../platform/errors.js';
import {isUuid} from '../../platform/validation.js';

export const maxText=4000;
export type Command={clientId:string;text:string|null;fileId:string|null};

/** Un message porte un texte, un fichier, ou les deux. */
export function command(input:Record<string,unknown>):Command{
  const {clientId,text,fileId}=input;
  if(!isUuid(clientId))throw invalid('Clé client invalide');
  if(text!==undefined&&(typeof text!=='string'||!text.trim()||text.length>maxText))throw invalid('Message invalide');
  if(fileId!==undefined&&!isUuid(fileId))throw invalid('Fichier invalide');
  if(text===undefined&&fileId===undefined)throw invalid('Le message est vide');
  return {clientId:clientId.toLowerCase(),text:(text as string|undefined)??null,fileId:fileId===undefined?null:(fileId as string).toLowerCase()};
}
