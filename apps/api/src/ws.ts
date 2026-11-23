import type {WebSocket} from 'ws';
import {WebSocketServer} from 'ws';
const channels=new Map<string,Set<WebSocket>>();
export const add=(channel:string,s:WebSocket)=>{let set=channels.get(channel);if(!set)channels.set(channel,set=new Set());set.add(s);s.on('close',()=>set!.delete(s));};
export const broadcast=(channel:string,event:unknown)=>{for(const s of channels.get(channel)||[])if(s.readyState===1)s.send(JSON.stringify(event));};
export const channelCount=()=>[...channels.values()].reduce((n,s)=>n+s.size,0);
export function setup(server:any){const wss=new WebSocketServer({noServer:true});server.server.on('upgrade',(req:any,socket:any,head:any)=>{if(!req.url?.startsWith('/api/ws'))return;wss.handleUpgrade(req,socket,head,(ws)=>wss.emit('connection',ws,req));});wss.on('connection',(socket,req)=>{socket.on('message',(raw)=>{try{const m=JSON.parse(String(raw));if(m.subscribe&&typeof m.subscribe==='string')add(m.subscribe,socket);}catch{}});socket.send(JSON.stringify({type:'ready',version:1}));});return wss;}
