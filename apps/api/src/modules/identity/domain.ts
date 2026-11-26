import {invalid} from '../../platform/errors.js';
import {label} from '../../platform/validation.js';

export type GlobalRole='user'|'admin';
export const handlePattern=/^[a-z0-9_]{3,32}$/;
export const displayName=(value:unknown)=>label(value,80,'Nom affiché invalide');

export function handle(value:unknown){
  const normalized=typeof value==='string'?value.toLowerCase():'';
  if(!handlePattern.test(normalized))throw invalid('Identifiant invalide');
  return normalized;
}
export function password(value:unknown){
  if(typeof value!=='string'||value.length<12||value.length>128)throw invalid('Le mot de passe compte 12 à 128 caractères');
  return value;
}
