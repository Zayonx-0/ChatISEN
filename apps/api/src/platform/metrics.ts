import client from 'prom-client';
import type {FastifyInstance} from 'fastify';
import type {Queryable} from './db.js';
import {oldestOutboxAge} from './realtime.js';
export const registry=new client.Registry();client.collectDefaultMetrics({register:registry,prefix:'chatisen_'});
const requests=new client.Counter({name:'chatisen_http_requests_total',help:'HTTP requests',labelNames:['method','route','status']});registry.registerMetric(requests);
const httpDuration=new client.Histogram({name:'chatisen_http_request_duration_seconds',help:'HTTP response time',labelNames:['method','route','status'],buckets:[0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5],registers:[registry]});
export const messages=new client.Counter({name:'chatisen_messages_total',help:'Messages persisted'});registry.registerMetric(messages);
export const activeSockets=new client.Gauge({name:'chatisen_ws_connections',help:'WebSocket connections'});registry.registerMetric(activeSockets);
export const messageDelivery=new client.Histogram({name:'chatisen_message_delivery_seconds',help:'Time from message creation to WebSocket acknowledgement',buckets:[0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5,15,60],registers:[registry]});
const outboxAge=new client.Gauge({name:'chatisen_outbox_oldest_pending_seconds',help:'Age of the oldest unprocessed outbox event',registers:[registry]});
const pushEvents=new client.Counter({name:'chatisen_push_events_total',help:'Observed Push failures, expirations and retry attempts',labelNames:['event'],registers:[registry]});
const establishedCalls=new client.Counter({name:'chatisen_calls_established_total',help:'Established peer-to-peer calls by first observed ICE route',labelNames:['route'],registers:[registry]});
for(const event of ['failed','expired','retry'])pushEvents.inc({event},0);
for(const route of ['direct','relay'])establishedCalls.inc({route},0);

export function observeHttp(app:FastifyInstance){
  app.addHook('onResponse',async(request,reply)=>{
    const labels={method:request.method,route:request.routeOptions.url??'unknown',status:String(reply.statusCode)};
    requests.inc(labels);httpDuration.observe(labels,reply.elapsedTime/1000);
  });
}
export async function collectMetrics(db:Queryable){
  outboxAge.set(await oldestOutboxAge(db));
  return registry.metrics();
}
export function observePush(event:'failed'|'expired'|'retry',count=1){pushEvents.inc({event},count);}
export function observeEstablishedCall(route:'direct'|'relay'){establishedCalls.inc({route});}

const callSamples=new client.Counter({name:'chatisen_call_quality_samples_total',help:'Call quality samples received',labelNames:['candidate_type']});registry.registerMetric(callSamples);
const callRtt=new client.Histogram({name:'chatisen_call_rtt_milliseconds',help:'Round-trip time measured by browsers',buckets:[25,50,100,200,400,800]});registry.registerMetric(callRtt);
const callJitter=new client.Histogram({name:'chatisen_call_jitter_milliseconds',help:'Jitter measured by browsers',buckets:[5,10,20,30,50,100]});registry.registerMetric(callJitter);
const callBitrate=new client.Histogram({name:'chatisen_call_bitrate_kilobits_per_second',help:'Media bitrate reported by browsers',buckets:[16,32,64,128,256,512,1024,2048,4096],registers:[registry]});
const callPackets=new client.Counter({name:'chatisen_call_packets_total',help:'Media packets reported by browsers',labelNames:['result']});registry.registerMetric(callPackets);
export function callQuality(sample:{candidateType:string;rttMs:number;jitterMs:number;bitrateKbps:number;packetsReceived:number;packetsLost:number}){
  callSamples.inc({candidate_type:sample.candidateType});callRtt.observe(sample.rttMs);callJitter.observe(sample.jitterMs);callBitrate.observe(sample.bitrateKbps);
  callPackets.inc({result:'received'},sample.packetsReceived);callPackets.inc({result:'lost'},sample.packetsLost);
}
