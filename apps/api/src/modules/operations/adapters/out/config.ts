import type {OperationsOptions} from '../../application.js';
import {type Inventory,type Target,vmName} from '../../domain.js';
import {publicCertificates} from './certificates.js';
import {gcpOperations} from './cloud.js';
import {prometheus} from './prometheus.js';

export function operationsFromEnv(env=process.env):OperationsOptions{
  const {OPERATIONS_PROJECT:project,OPERATIONS_ZONE_A:zoneA,OPERATIONS_ZONE_B:zoneB,
    OPERATIONS_SQL_INSTANCE:sql,OPERATIONS_PROMETHEUS_URL:prometheusUrl}=env;
  const inventory:Inventory={};
  const put=(target:Target,name:string|undefined,zone:string|undefined)=>{
    if(name&&zone&&vmName.test(name)&&/^[a-z0-9-]+-[a-z]$/.test(zone))inventory[target]={name,zone};
  };
  put('sfu-1','chatisen-sfu-1',zoneA);put('sfu-2','chatisen-sfu-2',zoneB);
  put('coturn','chatisen-turn',zoneA);put('supervision','chatisen-ops',zoneA);
  const cloud=project&&sql&&/^[a-z0-9-]+$/.test(project)&&vmName.test(sql)?gcpOperations(project,sql):undefined;
  let base:URL|undefined;
  try{if(prometheusUrl)base=new URL(prometheusUrl);}catch{}
  const monitoring=base?.protocol==='http:'||base?.protocol==='https:'?prometheus(base,inventory,{'app-a':zoneA,'app-b':zoneB}):undefined;
  const grafanaCommand=inventory.supervision&&
    `gcloud compute ssh chatisen-ops --zone ${inventory.supervision.zone} --tunnel-through-iap -- -N -L 3000:localhost:3000`;
  return {cloud,monitoring,inventory,grafanaCommand,certificates:publicCertificates(env.OPERATIONS_WEB_HOST,env.TURN_HOST),
    restartsEnabled:env.OPERATIONS_RESTARTS_ENABLED==='true'};
}
