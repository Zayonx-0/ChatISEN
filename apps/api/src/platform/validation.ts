import {invalid} from './errors.js';

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid=(value:unknown):value is string=>typeof value==='string'&&uuidPattern.test(value);

export const isSeq=(value:unknown):value is string=>typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n;

/** Corps JSON strict : les champs obligatoires sont présents et aucun champ inconnu n'est admis. */
export function body(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('Corps JSON attendu');
  const fields=Object.keys(value);
  if(required.some(name=>!fields.includes(name))||fields.some(name=>!required.includes(name)&&!optional.includes(name)))throw invalid('Champs invalides');
  return value as Record<string,unknown>;
}

export function pageLimit(value:unknown,fallback=50){
  const limit=value===undefined?fallback:Number(value);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw invalid('Pagination invalide');
  return limit;
}

/** Texte non vide après rognage, de longueur bornée. */
export function label(value:unknown,max:number,message:string){
  if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw invalid(message);
  return value.trim();
}

/** Compteur à fenêtre fixe, propre à chaque réplica. */
export function budget(max:number,windowMs=60_000){
  const slots=new Map<string,{count:number;reset:number}>();
  return (key:string)=>{
    const now=Date.now();let slot=slots.get(key);
    if(!slot||slot.reset<now){slot={count:0,reset:now+windowMs};slots.set(key,slot);if(slots.size>5000)for(const [other,value] of slots)if(value.reset<now)slots.delete(other);}
    return ++slot.count<=max;
  };
}
