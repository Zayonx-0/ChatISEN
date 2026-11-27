import type {Database} from '../../platform/db.js';
import {Failure,notFound} from '../../platform/errors.js';
import {callQuality} from '../../platform/metrics.js';
import {budget} from '../../platform/validation.js';
import type {CallRegistry} from '../calls/index.js';
import * as store from './adapters/out/store.js';
import type {Sample} from './domain.js';
import type {QualityReport} from './ports.js';

export class QualityService implements QualityReport{
  private allowed=budget(20);
  constructor(private db:Database,private calls:CallRegistry){}

  async ingest(callId:string,userId:string,samples:Sample[]){
    if(!await this.calls.participated(callId,userId))throw notFound('Appel indisponible');
    if(!this.allowed(`${userId}:${callId}`))throw new Failure('rate_limited','Trop de lots de mesures');
    for(const sample of await store.insert(this.db.pool,callId,userId,samples))callQuality(sample);
  }
  summary(callId:string){return store.summary(this.db.pool,callId);}
}
