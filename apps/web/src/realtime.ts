import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api.js';

export type Frame={v:1;type:string;conversationId?:string;seq?:string;fromSeq?:string;eventId?:string;seenUserEventIds?:string[];at?:string;event?:string;data?:any};
export type Connection='connecting'|'online'|'offline';

/**
 * Une seule WebSocket par onglet. Le topic user:{userId} est abonné d'office ; la
 * conversation ouverte est suivie avec « afterSeq » pour reprendre après une coupure.
 */
export function useRealtime(userId:string|undefined,conversationId:string|undefined,cursor:React.RefObject<string>,onFrame:(frame:Frame)=>void,onOpen:()=>void){
  const [connection,setConnection]=useState<Connection>('connecting');
  const socket=useRef<WebSocket|null>(null);const current=useRef<string|undefined>(conversationId);const subscribed=useRef<string|undefined>(undefined);
  const recovery=useRef<{conversationId:string;ws:WebSocket;controller:AbortController}|null>(null);
  const handlers=useRef({onFrame,onOpen});handlers.current={onFrame,onOpen};
  current.current=conversationId;
  const sync=useCallback(()=>{
    const ws=socket.current;if(!ws||ws.readyState!==WebSocket.OPEN)return;
    if(subscribed.current&&subscribed.current!==current.current)ws.send(JSON.stringify({v:1,type:'unsubscribe',conversationId:subscribed.current}));
    if(current.current&&recovery.current?.conversationId===current.current)return;
    if(current.current&&subscribed.current!==current.current)
      ws.send(JSON.stringify({v:1,type:'subscribe',conversationId:current.current,afterSeq:cursor.current||'0'}));
    subscribed.current=current.current;
  },[cursor]);
  useEffect(()=>{
    if(!userId)return;let closed=false;let retry:ReturnType<typeof setTimeout>|undefined;let beat:ReturnType<typeof setInterval>|undefined;let delay=1000;
    const seen=new Map<string,number>();let resume=false;
    const cancel=(ws:WebSocket|null)=>{if(recovery.current?.ws===ws){recovery.current.controller.abort();recovery.current=null;}};
    const resync=async(ws:WebSocket,conversationId:string,fromSeq:string)=>{
      if(current.current!==conversationId||subscribed.current!==conversationId||recovery.current)return;
      const controller=new AbortController();
      const job={conversationId,ws,controller};
      recovery.current=job;subscribed.current=undefined;
      try{
        let after=fromSeq;
        for(;;){
          const page=await api<{items:Frame[];nextAfterSeq:string|null;hasMore:boolean}>(`/conversations/${conversationId}/events?afterSeq=${after}`,{signal:controller.signal});
          if(recovery.current!==job||current.current!==conversationId)return;
          page.items.forEach(handlers.current.onFrame);
          if(!page.hasMore||!page.nextAfterSeq)break;
          after=page.nextAfterSeq;
        }
      }catch{if(recovery.current===job)ws.close();return;}
      finally{if(recovery.current===job)recovery.current=null;}
      if(current.current===conversationId&&socket.current===ws)sync();
    };
    const open=()=>{if(closed)return;setConnection('connecting');subscribed.current=undefined;
      const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/v1/ws${resume?'?resumeUserEvents=1':''}`);socket.current=ws;
      ws.onopen=()=>{beat=setInterval(()=>ws.readyState===WebSocket.OPEN&&ws.send(JSON.stringify({v:1,type:'ping'})),25000);};
      ws.onmessage=event=>{if(closed||socket.current!==ws)return;try{
        const frame=JSON.parse(String(event.data)) as Frame;
        if(frame.type==='ready'){
          const now=performance.now();
          for(const id of frame.seenUserEventIds??[])seen.set(id,now);
          resume=true;delay=1000;setConnection('online');sync();handlers.current.onOpen();
        }
        if(frame.type==='resync_required'&&frame.conversationId&&frame.fromSeq){void resync(ws,frame.conversationId,frame.fromSeq);return;}
        if(frame.eventId){
          const now=performance.now();
          for(const [id,at] of seen){if(now-at<360_000)break;seen.delete(id);}
          if(seen.has(frame.eventId))return;
          seen.set(frame.eventId,now);
        }
        handlers.current.onFrame(frame);
      }catch{/* trame ignorée */}};
      ws.onclose=()=>{cancel(ws);if(beat)clearInterval(beat);if(!closed){setConnection('offline');retry=setTimeout(open,delay);delay=Math.min(delay*2,8000);}};
      ws.onerror=()=>ws.close();};
    const online=()=>{if(socket.current?.readyState===WebSocket.CLOSED&&retry){clearTimeout(retry);open();}};
    window.addEventListener('online',online);open();
    return()=>{closed=true;window.removeEventListener('online',online);if(retry)clearTimeout(retry);if(beat)clearInterval(beat);cancel(socket.current);socket.current?.close();socket.current=null;};
  },[userId,sync]);
  useEffect(()=>{
    if(recovery.current&&recovery.current.conversationId!==conversationId){recovery.current.controller.abort();recovery.current=null;}
    sync();
  },[conversationId,sync]);
  return connection;
}
