import type {Health,Target,Vm} from './domain.js';

export type Series=(number|null)[];
export type Digests={api:string|null;edge:string|null};
export type VmHealth={health:Health;boot:number|null;digests:Digests|null;vm?:Vm};
export type VmResources={cpu:Series;memory:Series;disk:Series};
export type Metrics=Record<string,Series>;

export interface Monitoring {
  health():Promise<Partial<Record<Target,VmHealth>>>;
  metrics():Promise<Metrics>;
  resources():Promise<Partial<Record<Target,VmResources>>>;
  alerts():Promise<{name:string;count:number}[]>;
}

export interface CloudControl {
  isRunning(vm:Vm):Promise<boolean>;
  reset(vm:Vm,requestId:string):Promise<'accepted'|'rejected'|'unknown'>;
  lastBackup():Promise<string|null>;
}

export type TlsEndpoint='load-balancer'|'coturn';
export interface Certificates { expiry(endpoint:TlsEndpoint):Promise<string|null> }

export interface ActivitySources {
  accounts():Promise<{total:number;active:number;disabled:number}>;
  conversations():Promise<number>;
  dailyMessages():Promise<{day:string;count:number}[]>;
  activeCalls():Promise<number>;
  fileBytes():Promise<number>;
  database():Promise<void>;
}
