import {invalid} from '../../platform/errors.js';

export const maxBatch=30;
export const candidateTypes=['host','srflx','prflx','relay'] as const;
export type Sample={capturedAt:string;packetsReceived:number;packetsLost:number;jitterMs:number;rttMs:number;bitrateKbps:number;candidateType:typeof candidateTypes[number]};
const fields=['capturedAt','packetsReceived','packetsLost','jitterMs','rttMs','bitrateKbps','candidateType'];

const count=(value:unknown)=>Number.isSafeInteger(value)&&(value as number)>=0;
const measure=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<1e8;

/** Mesures réseau seulement : ni message, ni image, ni son. Tout champ inconnu est refusé. */
export function samples(value:unknown,now=Date.now()):Sample[]{
  if(!Array.isArray(value)||!value.length||value.length>maxBatch)throw invalid('Un lot compte 1 à 30 mesures');
  return value.map(item=>{
    const sample=item as Record<string,unknown>;
    if(!sample||typeof sample!=='object'||Object.keys(sample).length!==fields.length||!fields.every(name=>name in sample))throw invalid('Mesure invalide');
    const at=typeof sample.capturedAt==='string'?Date.parse(sample.capturedAt):NaN;
    if(!(Math.abs(now-at)<86_400_000)||!count(sample.packetsReceived)||!count(sample.packetsLost)||!measure(sample.jitterMs)||!measure(sample.rttMs)||!measure(sample.bitrateKbps)||!candidateTypes.includes(sample.candidateType as Sample['candidateType']))throw invalid('Mesure invalide');
    return {...(sample as unknown as Sample),capturedAt:new Date(at).toISOString()};
  });
}
