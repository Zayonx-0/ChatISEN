import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {matches,startApp,type Who} from '../helpers.js';

test('quality: only participants send bounded network measures, without duplicates',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const h=await startApp({metricsRoute:true});
  try{
    const alice=await h.register('alice'),bob=await h.register('bob'),eve=await h.register('eve');
    const cid=await h.direct(alice,bob);
    const call=(await h.call(alice,'POST',`/conversations/${cid}/calls`,{clientId:randomUUID(),mode:'audio'})).json();
    const sample={capturedAt:new Date().toISOString(),packetsReceived:980,packetsLost:20,jitterMs:4.5,rttMs:42,bitrateKbps:31.2,candidateType:'relay'};
    const send=(who:Who,samples:unknown)=>h.call(who,'POST',`/calls/${call.id}/quality-samples`,{samples});
    matches('QualityBatch',{samples:[sample]});
    assert.equal((await send(bob,[sample])).statusCode,404,'invited but never joined');
    assert.equal((await send(eve,[sample])).statusCode,404);
    await h.call(bob,'PUT',`/calls/${call.id}/participants/me`,{state:'joined'});
    const metrics=async()=>{
      const {body}=await h.app.inject('/metrics');
      return [
        'chatisen_call_quality_samples_total{candidate_type="relay"}',
        'chatisen_call_rtt_milliseconds_count','chatisen_call_jitter_milliseconds_count',
        'chatisen_call_packets_total{result="received"}','chatisen_call_packets_total{result="lost"}',
      ].map(name=>Number(body.split('\n').find(line=>line.startsWith(name+' '))?.slice(name.length+1)??0));
    };
    const before=await metrics();
    assert.equal((await send(bob,[sample])).statusCode,202);
    const accepted=await metrics();
    assert.deepEqual(accepted.map((value,index)=>value-before[index]),[1,1,1,980,20]);
    assert.equal((await send(bob,[sample])).statusCode,202,'a retried batch adds nothing');
    assert.deepEqual(await metrics(),accepted);
    for(const bad of [[],[{...sample,candidateType:'unknown'}],[{...sample,packetsLost:-1}],[{...sample,sdp:'v=0'}],[{...sample,capturedAt:'2020-01-01T00:00:00Z'}],Array.from({length:31},()=>sample)])
      assert.equal((await send(alice,bad)).statusCode,400);
    await send(alice,[{...sample,candidateType:'host',rttMs:20,packetsLost:0}]);
    await h.call(alice,'PATCH',`/calls/${call.id}`,{state:'ended'});
    assert.equal((await send(alice,[{...sample,capturedAt:new Date(Date.now()+1).toISOString()}])).statusCode,202,'the last window arrives after hang-up');
    const summary=(await h.services.quality.summary(call.id))!;
    assert.equal(summary.samples,3);assert.ok(Math.abs(summary.relayShare-2/3)<1e-9);assert.ok(summary.lossRatio>0&&summary.lossRatio<0.02);
    let limited=0;for(let i=0;i<25;i++)if((await send(bob,[sample])).statusCode===429)limited++;
    assert.ok(limited>0);
  }finally{await h.close();}
});
