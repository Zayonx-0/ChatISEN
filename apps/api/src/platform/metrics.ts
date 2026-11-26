import client from 'prom-client';
export const registry=new client.Registry();client.collectDefaultMetrics({register:registry,prefix:'chatisen_'});
export const requests=new client.Counter({name:'chatisen_http_requests_total',help:'HTTP requests',labelNames:['method','route','status']});registry.registerMetric(requests);
export const messages=new client.Counter({name:'chatisen_messages_total',help:'Messages persisted'});registry.registerMetric(messages);
export const activeSockets=new client.Gauge({name:'chatisen_ws_connections',help:'WebSocket connections'});registry.registerMetric(activeSockets);

const callSamples=new client.Counter({name:'chatisen_call_quality_samples_total',help:'Call quality samples received',labelNames:['candidate_type']});registry.registerMetric(callSamples);
const callRtt=new client.Histogram({name:'chatisen_call_rtt_milliseconds',help:'Round-trip time measured by browsers',buckets:[25,50,100,200,400,800]});registry.registerMetric(callRtt);
const callJitter=new client.Histogram({name:'chatisen_call_jitter_milliseconds',help:'Jitter measured by browsers',buckets:[5,10,20,30,50,100]});registry.registerMetric(callJitter);
const callPackets=new client.Counter({name:'chatisen_call_packets_total',help:'Media packets reported by browsers',labelNames:['result']});registry.registerMetric(callPackets);
export function callQuality(sample:{candidateType:string;rttMs:number;jitterMs:number;packetsReceived:number;packetsLost:number}){
  callSamples.inc({candidate_type:sample.candidateType});callRtt.observe(sample.rttMs);callJitter.observe(sample.jitterMs);
  callPackets.inc({result:'received'},sample.packetsReceived);callPackets.inc({result:'lost'},sample.packetsLost);
}
