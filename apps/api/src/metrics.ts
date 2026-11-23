import client from 'prom-client';
export const registry=new client.Registry();client.collectDefaultMetrics({register:registry,prefix:'chatisen_'});
export const requests=new client.Counter({name:'chatisen_http_requests_total',help:'HTTP requests',labelNames:['method','route','status']});registry.registerMetric(requests);
export const messages=new client.Counter({name:'chatisen_messages_total',help:'Messages persisted'});registry.registerMetric(messages);
export const activeSockets=new client.Gauge({name:'chatisen_ws_connections',help:'WebSocket connections'});registry.registerMetric(activeSockets);
