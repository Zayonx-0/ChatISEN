import {api,write} from './api.js';

const candidateTypes=['host','srflx','prflx','relay'] as const;
type Candidate=typeof candidateTypes[number];
export type Quality={level:'bonne'|'moyenne'|'faible';rttMs:number|null;lossPercent:number;jitterMs:number|null;bitrateKbps:number;candidateType:Candidate|'unknown'};
type Sample={capturedAt:string;packetsReceived:number;packetsLost:number;jitterMs:number;rttMs:number;bitrateKbps:number;candidateType:Candidate};
type Totals={bytes:number;lost:number;received:number};
type Stat=RTCStats&{
  selectedCandidatePairId?:string;localCandidateId?:string;remoteCandidateId?:string;candidateType?:Candidate;
  nominated?:boolean;state?:string;currentRoundTripTime?:number;jitter?:number;bytesReceived?:number;packetsLost?:number;packetsReceived?:number;
};

export function monitorQuality(callId:string,csrf:string,read:()=>Promise<RTCStatsReport[]>,display:(quality:Quality)=>void){
  let previous=new Map<string,Totals>();let lastAt:number|undefined;let running=false;let stopped=false;
  const batch:Sample[]=[];
  const flush=(keepalive=false)=>{
    if(batch.length)void api(`/calls/${callId}/quality-samples`,{...write(csrf,'POST',{samples:batch.splice(0)}),keepalive}).catch(()=>{});
  };
  const sample=async()=>{
    if(running||stopped)return;
    running=true;
    try{
      const reports=await read();
      if(stopped||!reports.length)return;
      const stats=new Map<string,Stat>();
      reports.forEach(report=>report.forEach((entry:Stat)=>stats.set(entry.id,entry)));
      const pairs=new Set<Stat>();const totals=new Map<string,Totals>();
      let bytes=0,lost=0,received=0,jitter:number|null=null,rtt:number|null=null;
      for(const entry of stats.values()){
        if(entry.type==='transport'&&entry.selectedCandidatePairId){
          const pair=stats.get(entry.selectedCandidatePairId);if(pair)pairs.add(pair);
        }
        if(entry.type!=='inbound-rtp')continue;
        const current={bytes:entry.bytesReceived??0,lost:Math.max(0,entry.packetsLost??0),received:entry.packetsReceived??0};
        const before=previous.get(entry.id);
        totals.set(entry.id,current);
        bytes+=Math.max(0,current.bytes-(before?.bytes??0));
        lost+=Math.max(0,current.lost-(before?.lost??0));
        received+=Math.max(0,current.received-(before?.received??0));
        if(typeof entry.jitter==='number')jitter=Math.max(jitter??0,Math.round(entry.jitter*1000));
      }
      if(!pairs.size)for(const entry of stats.values())if(entry.type==='candidate-pair'&&entry.nominated&&entry.state==='succeeded')pairs.add(entry);
      let candidateType:Quality['candidateType']='unknown';
      for(const pair of pairs){
        if(typeof pair.currentRoundTripTime==='number')rtt=Math.max(rtt??0,Math.round(pair.currentRoundTripTime*1000));
        const local=stats.get(pair.localCandidateId??'')?.candidateType,remote=stats.get(pair.remoteCandidateId??'')?.candidateType;
        if(local==='relay'||remote==='relay')candidateType='relay';
        else if(candidateType==='unknown'&&local&&candidateTypes.includes(local))candidateType=local;
      }
      if(!pairs.size&&!totals.size)return;
      const now=Date.now(),bitrateKbps=lastAt===undefined?0:Math.round(bytes*8/Math.max(1,now-lastAt));
      const lossPercent=lost+received?Math.round(1000*lost/(lost+received))/10:0;
      const level=lossPercent>8||(rtt??0)>400||(previous.size>0&&totals.size>0&&received===0)?'faible':lossPercent>2||(rtt??0)>200||(jitter??0)>40?'moyenne':'bonne';
      previous=totals;
      display({level,rttMs:rtt,lossPercent,jitterMs:jitter,bitrateKbps,candidateType});
      const baseline=lastAt===undefined;lastAt=now;
      if(candidateType==='unknown')return;
      batch.push({capturedAt:new Date(now).toISOString(),packetsReceived:baseline?0:received,packetsLost:baseline?0:lost,jitterMs:jitter??0,rttMs:rtt??0,bitrateKbps,candidateType});
      if(batch.length===6)flush();
    }catch{/* Une mesure manquée n'interrompt pas l'appel. */}
    finally{running=false;}
  };
  const timer=setInterval(()=>void sample(),5000);void sample();
  return ()=>{stopped=true;clearInterval(timer);flush(true);};
}
