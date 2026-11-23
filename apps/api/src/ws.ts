import type {WebSocket} from 'ws';

type Subscription={socket:WebSocket; authorized:()=>boolean};
const channels=new Map<string,Set<Subscription>>();
/** A subscription is valid only as long as the originating session and membership remain valid. */
export function add(channel:string,socket:WebSocket,authorized:()=>boolean){
  if(!authorized())return false;
  let set=channels.get(channel);if(!set)channels.set(channel,set=new Set());
  const entry={socket,authorized};set.add(entry);
  socket.once('close',()=>{set!.delete(entry);if(!set!.size)channels.delete(channel)});
  return true;
}
export function broadcast(channel:string,event:unknown){
  const set=channels.get(channel);for(const entry of set||[]){
    if(!entry.authorized()){set!.delete(entry);continue;}
    if(entry.socket.readyState===1)entry.socket.send(JSON.stringify(event));
  }
  if(set&&!set.size)channels.delete(channel);
}
export const channelCount=()=>[...channels.values()].reduce((n,s)=>n+s.size,0);
