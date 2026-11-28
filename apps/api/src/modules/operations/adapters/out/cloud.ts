import {serviceAccountToken} from '../../../../platform/google-metadata.js';
import type {Vm} from '../../domain.js';
import type {CloudControl} from '../../ports.js';

export function gcpOperations(project:string,sqlInstance:string):CloudControl{
  const compute=(vm:Vm)=>`https://compute.googleapis.com/compute/v1/projects/${project}/zones/${vm.zone}/instances/${vm.name}`;
  const backups=`https://sqladmin.googleapis.com/sql/v1beta4/projects/${project}/instances/${sqlInstance}/backupRuns`;
  const call=async(url:string|URL,signal:AbortSignal,method='GET')=>fetch(url,{
    method,signal,redirect:'error',headers:{authorization:`Bearer ${await serviceAccountToken()}`},
  });
  return {
    async isRunning(vm){
      const response=await call(compute(vm)+'?fields=status',AbortSignal.timeout(3500));
      if(!response.ok)throw new Error('État Compute indisponible');
      const {status}=await response.json() as {status?:string};
      if(!status)throw new Error('État Compute absent');
      return status==='RUNNING';
    },
    async reset(vm,requestId){
      const response=await call(compute(vm)+'/reset?requestId='+requestId,AbortSignal.timeout(5000),'POST');
      if(response.ok)return 'accepted';
      // Une erreur de transport ou de passerelle peut survenir après la remise de la demande.
      return [400,401,403,404,412].includes(response.status)?'rejected':'unknown';
    },
    async lastBackup(){
      const signal=AbortSignal.timeout(3800),url=new URL(backups);
      url.searchParams.set('maxResults','100');
      url.searchParams.set('fields','items(status,endTime),nextPageToken');
      for(;;){
        const response=await call(url,signal);
        if(!response.ok)throw new Error('Sauvegardes SQL indisponibles');
        const data=await response.json() as {items?:{status:string;endTime?:string}[];nextPageToken?:string};
        const date=data.items?.find(item=>item.status==='SUCCESSFUL'&&item.endTime)?.endTime;
        if(date)return new Date(date).toISOString();
        if(!data.nextPageToken)return null;
        url.searchParams.set('pageToken',data.nextPageToken);
      }
    },
  };
}
