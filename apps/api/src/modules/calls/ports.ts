import type {Tx} from '../../platform/db.js';

export type Admission={serverUrl:string;token:string;expiresAt:string};

/** Port sortant vers les SFU des conférences. */
export interface MediaServer{
  admit(room:string,identity:string,seconds:number):Admission;
  removeParticipant(room:string,identity:string):Promise<void>;
  closeRoom(room:string):Promise<void>;
}

export interface CallRegistry{
  /** Vrai si l'utilisateur a réellement participé à cet appel. */
  participated(callId:string,userId:string):Promise<boolean>;
  recordMediaRoute(tx:Tx,callId:string,route:'direct'|'relay'):Promise<boolean>;
}
