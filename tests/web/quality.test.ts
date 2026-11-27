import test from 'node:test';
import assert from 'node:assert/strict';
import {monitorQuality} from '../../apps/web/src/quality.js';

test('qualité : mesure toutes les 5 s, envoi du lot complet puis du reliquat',async t=>{
  t.mock.timers.enable({apis:['setInterval','Date'],now:Date.UTC(2026,0,1)});
  const batches:{samples:{capturedAt:string;packetsReceived:number;candidateType:string}[];keepalive?:boolean}[]=[];
  t.mock.method(globalThis,'fetch',async(_url:string,options:RequestInit)=>{
    batches.push({...JSON.parse(String(options.body)),keepalive:options.keepalive});
    return Response.json({accepted:true},{status:202});
  });
  let reads=0;
  const report=async()=>{
    const packetsReceived=++reads*10;
    return [new Map(Object.entries({
      pair:{id:'pair',type:'candidate-pair',nominated:true,state:'succeeded',localCandidateId:'local',currentRoundTripTime:0.05},
      local:{id:'local',type:'local-candidate',candidateType:'relay'},
      audio:{id:'audio',type:'inbound-rtp',bytesReceived:packetsReceived*10,packetsReceived,jitter:0.003},
    })) as unknown as RTCStatsReport];
  };
  const stop=monitorQuality('call','csrf',report,()=>{});
  const advance=async(ms:number)=>{t.mock.timers.tick(ms);await Promise.resolve();};
  try{
    await advance(0);
    await advance(4999);assert.equal(reads,1);
    await advance(1);assert.equal(reads,2);
    for(let i=0;i<4;i++)await advance(5000);
    assert.deepEqual(batches.map(batch=>batch.samples.length),[6]);
    assert.equal(new Date(batches[0].samples[1].capturedAt).getTime()-new Date(batches[0].samples[0].capturedAt).getTime(),5000);
    assert.deepEqual(batches[0].samples.map(sample=>sample.packetsReceived),[0,10,10,10,10,10]);
    assert.ok(batches[0].samples.every(sample=>sample.candidateType==='relay'));
    await advance(5000);await advance(5000);
    stop();stop();await advance(5000);
    assert.deepEqual(batches.map(batch=>[batch.samples.length,batch.keepalive]),[[6,false],[2,true]]);
    assert.equal(reads,8);
  }finally{stop();}
});
