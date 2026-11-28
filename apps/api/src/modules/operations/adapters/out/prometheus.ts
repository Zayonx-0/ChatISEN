import {targets,type Inventory,type Target,type Vm} from '../../domain.js';
import type {Digests,Metrics,Monitoring,Series,VmHealth,VmResources} from '../../ports.js';

type Sample=[number,string];
type Result={metric:Record<string,string>;value?:Sample;values?:Sample[]};
const appJobs='api|noeud-app';
const nodeJobs='noeud-app|noeud-sfu|noeud-turn|noeud-ops';
const step=15,points=61;
const rate=(name:string)=>`sum(rate(${name}[5m]))`;
const p95=(name:string)=>`histogram_quantile(0.95, sum by(le) (rate(${name}_bucket[5m])))`;
const metrics={
  httpRequests:rate('chatisen_http_requests_total'),
  httpErrors:`${rate('chatisen_http_requests_total{status=~"[45].."}')} or 0 * ${rate('chatisen_http_requests_total')}`,
  httpP95:p95('chatisen_http_request_duration_seconds'),
  websockets:'sum(chatisen_ws_connections)',
  messages:rate('chatisen_messages_total'),
  deliveryP95:p95('chatisen_message_delivery_seconds'),
  outboxAge:'max(chatisen_outbox_oldest_pending_seconds)',
  pushFailures:rate('chatisen_push_events_total{event="failed"}'),
  directCalls:rate('chatisen_calls_established_total{route="direct"}'),
  relayCalls:rate('chatisen_calls_established_total{route="relay"}'),
  callRtt:p95('chatisen_call_rtt_milliseconds'),
  callJitter:p95('chatisen_call_jitter_milliseconds'),
  callBitrate:p95('chatisen_call_bitrate_kilobits_per_second'),
  callLoss:`100 * ${rate('chatisen_call_packets_total{result="lost"}')} / (${rate('chatisen_call_packets_total')} > 0)`,
};
const node=(name:string,labels='')=>`${name}{job=~"${nodeJobs}"${labels}}`;
const resourceQueries={
  cpu:`100 * (1 - avg by(job,instance,zone)(rate(${node('node_cpu_seconds_total',',mode="idle"')}[5m])))`,
  memory:`100 * (1 - ${node('node_memory_MemAvailable_bytes')} / ${node('node_memory_MemTotal_bytes')})`,
  disk:`100 * (1 - ${node('node_filesystem_avail_bytes',',mountpoint="/",fstype!~"tmpfs|overlay"')} / ${node('node_filesystem_size_bytes',',mountpoint="/",fstype!~"tmpfs|overlay"')})`,
};
const tagged=(queries:Record<string,string>)=>Object.entries(queries).map(([key,query])=>`label_replace((${query}),"chatisen_series","${key}","","")`).join(' or ');
const fresh=(selector:string)=>`(${selector} and (time() - timestamp(${selector}) < 50))`;
const release=(name:string)=>`${name}{job="noeud-app"}`;
const healthQuery=tagged({
  up:fresh(`up{job=~"${appJobs}|livekit|coturn|prometheus"}`),
  boot:fresh(node('node_boot_time_seconds')),
  report:fresh(release('chatisen_release_timestamp_seconds')),
  ready:fresh(release('chatisen_release_ready')),
  digest:fresh(release('chatisen_release_info')),
});
const rangeMetrics=tagged(metrics),rangeResources=tagged(resourceQueries);
const nodeJob:Record<Target,string>={'app-a':'noeud-app','app-b':'noeud-app','sfu-1':'noeud-sfu','sfu-2':'noeud-sfu',coturn:'noeud-turn',supervision:'noeud-ops'};
const upJob:Record<Target,string>={'app-a':'api','app-b':'api','sfu-1':'livekit','sfu-2':'livekit',coturn:'coturn',supervision:'prometheus'};
const digest=/^sha256:[0-9a-f]{64}$/;
const alertName=/^[a-zA-Z_][a-zA-Z0-9_]{0,79}$/;
const appName=/^chatisen-app-[a-z0-9][a-z0-9-]{0,49}[a-z0-9]$/;

function value(sample:Sample|undefined){
  const number=sample?Number(sample[1]):NaN;
  return Number.isFinite(number)?number:null;
}
function series(result:Result|undefined,start:number):Series{
  if(!result?.values?.length)return [];
  const values:Series=Array(points).fill(null);
  for(const sample of result.values){
    const index=(sample[0]-start)/step;
    if(Number.isInteger(index)&&index>=0&&index<points)values[index]=value(sample);
  }
  return values;
}

export function prometheus(base:URL,inventory:Inventory,appZones:Partial<Record<Target,string>>):Monitoring{
  async function query(path:string,parameters:Record<string,string>){
    const url=new URL('/api/v1/'+path,base);url.search=new URLSearchParams(parameters).toString();
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(3500)});
    if(!response.ok)throw new Error('Prometheus indisponible');
    const {status,data}=await response.json() as {status:string;data?:{result:Result[]}};
    if(status!=='success'||!Array.isArray(data?.result))throw new Error('Réponse Prometheus invalide');
    return data.result;
  }
  const range=async(expression:string)=>{
    const end=Math.floor(Date.now()/1000/step)*step,start=end-(points-1)*step;
    const results=await query('query_range',{query:expression,start:String(start),end:String(end),step:String(step)});
    return {results,start,end};
  };
  const collect=<T>(perTarget:(target:Target)=>T|undefined)=>Object.fromEntries(targets.flatMap(target=>{
    const data=perTarget(target);return data===undefined?[]:[[target,data]];
  })) as Partial<Record<Target,T>>;
  const byVm=(item:Result,vm:Vm,target:Target)=>item.metric.instance===vm.name&&(target==='supervision'||item.metric.zone===vm.zone);
  const identify=(items:Result[],target:Target):Vm|undefined=>{
    const zone=appZones[target];
    if(!zone)return inventory[target];
    const names=new Set(items.filter(({metric})=>metric.zone===zone&&appName.test(metric.instance??'')).map(item=>item.metric.instance));
    return names.size===1?{name:[...names][0],zone}:undefined;
  };
  return {
    async health(){
      const results=await query('query',{query:healthQuery,lookback_delta:'50s'});
      const app=results.filter(item=>item.metric.chatisen_series==='up'&&['api','noeud-app'].includes(item.metric.job));
      const now=Date.now()/1000;
      return collect<VmHealth>(target=>{
        const vm=identify(app,target);
        if(!vm)return undefined;
        const get=(key:string,job:string)=>results.find(item=>item.metric.chatisen_series===key&&item.metric.job===job&&
          ((target==='supervision'&&job==='prometheus')||byVm(item,vm,target)));
        const up=value(get('up',upJob[target])?.value),boot=value(get('boot',nodeJob[target])?.value);
        let health:VmHealth['health']=up===0?'down':up===1&&boot!==null?'healthy':'unknown';
        let digests:Digests|null=null;
        if(target==='app-a'||target==='app-b'){
          const time=value(get('report','noeud-app')?.value),ready=value(get('ready','noeud-app')?.value);
          const current=time!==null&&boot!==null&&time>=boot&&now-time>=-10&&now-time<50;
          if(up===1)health=!current||ready===null?'unknown':ready===1?'healthy':'down';
          const releases=current?results.filter(item=>item.metric.chatisen_series==='digest'&&item.metric.job==='noeud-app'&&byVm(item,vm,target)):[];
          const active=(container:string)=>{
            const expected=releases.filter(item=>item.metric.container===container&&value(item.value)===1);
            const name=expected.length===1?expected[0].metric.digest:'';
            return digest.test(name)?name:null;
          };
          if(current)digests={api:active('api'),edge:active('edge')};
        }
        return {health,boot,digests,vm};
      });
    },
    async metrics(){
      const {results,start}=await range(rangeMetrics);
      return Object.fromEntries(Object.keys(metrics).map(key=>[key,series(results.find(item=>item.metric.chatisen_series===key),start)])) as Metrics;
    },
    async resources(){
      const {results,start,end}=await range(rangeResources);
      const app=results.filter(item=>item.metric.job==='noeud-app'&&item.values?.at(-1)?.[0]===end);
      return collect<VmResources>(target=>{
        const vm=identify(app,target);
        if(!vm)return undefined;
        const read=(key:string)=>series(results.find(item=>item.metric.chatisen_series===key&&item.metric.job===nodeJob[target]&&byVm(item,vm,target)),start);
        return {cpu:read('cpu'),memory:read('memory'),disk:read('disk')};
      });
    },
    async alerts(){
      const active=await query('query',{query:'ALERTS{alertstate=~"pending|firing"}',lookback_delta:'50s'});
      const counts=new Map<string,number>();
      for(const {metric,value:sample} of active){
        const name=metric.alertname;
        if(alertName.test(name??'')&&value(sample)===1)counts.set(name,(counts.get(name)??0)+1);
      }
      return [...counts].sort(([a],[b])=>a.localeCompare(b)).map(([name,count])=>({name,count}));
    },
  };
}
