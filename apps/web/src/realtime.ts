import {useCallback,useEffect,useRef,useState} from 'react';

export type Frame={v:1;type:string;conversationId?:string;seq?:string;at?:string;event?:string;data?:any};
export type Connection='connecting'|'online'|'offline';

/**
 * Une seule WebSocket par onglet. Le topic user:{userId} est abonné d'office ; la
 * conversation ouverte est suivie avec « afterSeq » pour reprendre après une coupure.
 */
export function useRealtime(userId:string|undefined,conversationId:string|undefined,cursor:React.RefObject<string>,onFrame:(frame:Frame)=>void,onOpen:()=>void){
  const [connection,setConnection]=useState<Connection>('connecting');
  const socket=useRef<WebSocket|null>(null);const current=useRef<string|undefined>(conversationId);const subscribed=useRef<string|undefined>(undefined);
  const handlers=useRef({onFrame,onOpen});handlers.current={onFrame,onOpen};
  current.current=conversationId;
  const sync=useCallback(()=>{
    const ws=socket.current;if(!ws||ws.readyState!==WebSocket.OPEN)return;
    if(subscribed.current&&subscribed.current!==current.current)ws.send(JSON.stringify({v:1,type:'unsubscribe',conversationId:subscribed.current}));
    if(current.current&&subscribed.current!==current.current)ws.send(JSON.stringify({v:1,type:'subscribe',conversationId:current.current,afterSeq:cursor.current||'0'}));
    subscribed.current=current.current;
  },[cursor]);
  useEffect(()=>{
    if(!userId)return;let closed=false;let retry:ReturnType<typeof setTimeout>|undefined;let beat:ReturnType<typeof setInterval>|undefined;let delay=1000;
    const open=()=>{if(closed)return;setConnection('connecting');subscribed.current=undefined;
      const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/v1/ws`);socket.current=ws;
      ws.onopen=()=>{delay=1000;setConnection('online');sync();handlers.current.onOpen();beat=setInterval(()=>ws.readyState===WebSocket.OPEN&&ws.send(JSON.stringify({v:1,type:'ping'})),25000);};
      ws.onmessage=event=>{try{handlers.current.onFrame(JSON.parse(String(event.data)) as Frame);}catch{/* trame ignorée */}};
      ws.onclose=()=>{if(beat)clearInterval(beat);if(!closed){setConnection('offline');retry=setTimeout(open,delay);delay=Math.min(delay*2,8000);}};
      ws.onerror=()=>ws.close();};
    const online=()=>{if(socket.current?.readyState===WebSocket.CLOSED&&retry){clearTimeout(retry);open();}};
    window.addEventListener('online',online);open();
    return()=>{closed=true;window.removeEventListener('online',online);if(retry)clearTimeout(retry);if(beat)clearInterval(beat);socket.current?.close();socket.current=null;};
  },[userId,sync]);
  useEffect(()=>{sync();},[conversationId,sync]);
  return connection;
}
