import {useCallback,useEffect,useRef,useState} from 'react';
import {api,ApiError,write} from './api.js';
import {joinConference,type Conference,type Tile} from './conference.js';

export type CallMode='audio'|'video';
export type CallPhase='idle'|'outgoing'|'incoming'|'connecting'|'active';
export type Quality={level:'bonne'|'moyenne'|'faible';rttMs:number|null;lossPercent:number;jitterMs:number|null;bitrateKbps:number;candidateType:string};
export type Topology='p2p'|'sfu';
export type Admission={serverUrl:string;token:string;expiresAt:string};
export type CallView={phase:CallPhase;callId?:string;conversationId?:string;mode:CallMode;topology:Topology;initiator:boolean;muted:boolean;cameraOff:boolean;sharing:boolean;quality?:Quality;
  /** Conférence seulement : vignettes des participants, qualité estimée par le SFU. */
  tiles?:Tile[];level?:Quality['level'];reconnecting?:boolean};
type CallDto={id:string;conversationId:string;initiatorId:string;mode:CallMode;topology:'p2p'|'sfu';state:'ringing'|'active'|'ended'};
type Signal={type:'offer'|'answer'|'ice';data:any};
const idle:CallView={phase:'idle',mode:'audio',topology:'p2p',initiator:false,muted:false,cameraOff:false,sharing:false};
const reasons:Record<string,string>={declined:'Appel refusé.',expired:'Pas de réponse.',disconnected:'Le correspondant a été déconnecté.',ended:'Appel terminé.'};

// « ?relay » force le passage par TURN : sert à démontrer le relais.
const relayOnly=()=>new URLSearchParams(location.search).has('relay');
const iceConfiguration=()=>api<{iceServers:RTCIceServer[]}>('/ice-servers');

function lockDirectCall(userId:string,conversationId:string):Promise<(()=>void)|null>{
  if(!navigator.locks)return Promise.resolve(()=>{});
  return new Promise((resolve,reject)=>{
    void navigator.locks.request(`chatisen:direct-call:${userId}:${conversationId}`,{ifAvailable:true},lock=>{
      if(!lock){resolve(null);return;}
      return new Promise<void>(release=>resolve(release));
    }).catch(reject);
  });
}

/**
 * Appels à deux en WebRTC pair-à-pair : le serveur ne transporte que la signalisation, les
 * médias passent directement ou par le relais TURN. Les conférences de groupe passent par un SFU.
 */
export function useCalls(userId:string|undefined,csrf:string){
  const [view,setView]=useState<CallView>(idle);const [notice,setNotice]=useState('');
  const [localStream,setLocal]=useState<MediaStream|null>(null);const [remoteStream,setRemote]=useState<MediaStream|null>(null);
  const state=useRef<CallView>(idle);const peer=useRef<RTCPeerConnection|null>(null);const media=useRef<MediaStream|null>(null);const screen=useRef<MediaStream|null>(null);
  const pendingIce=useRef<RTCIceCandidateInit[]>([]);const queued=useRef(new Map<string,Signal[]>());const chain=useRef(Promise.resolve());
  const conference=useRef<Conference|null>(null);
  const releaseDirect=useRef<(()=>void)|null>(null);
  const lastState=useRef(new Map<string,string>());const timers=useRef<ReturnType<typeof setTimeout>[]>([]);const previous=useRef<{bytes:number;lost:number;received:number;at:number}|null>(null);

  const update=useCallback((patch:Partial<CallView>)=>{state.current={...state.current,...patch};setView(state.current);},[]);

  const cleanup=useCallback((message='')=>{
    releaseDirect.current?.();releaseDirect.current=null;
    timers.current.forEach(t=>{clearTimeout(t);clearInterval(t);});timers.current=[];previous.current=null;
    peer.current?.close();peer.current=null;pendingIce.current=[];queued.current.clear();
    void conference.current?.leave();conference.current=null;
    media.current?.getTracks().forEach(t=>t.stop());media.current=null;screen.current?.getTracks().forEach(t=>t.stop());screen.current=null;
    setLocal(null);setRemote(null);state.current=idle;setView(idle);if(message)setNotice(message);
  },[]);

  const holdDirect=useCallback(async(conversationId:string)=>{
    if(!userId)return false;
    const attempt=state.current;
    const release=await lockDirectCall(userId,conversationId);
    if(state.current!==attempt){release?.();return false;}
    if(!release){cleanup('Appel déjà ouvert dans un autre onglet.');return false;}
    releaseDirect.current=release;
    return true;
  },[cleanup,userId]);

  const signal=useCallback((callId:string,type:Signal['type'],data:unknown)=>api(`/calls/${callId}/signals`,write(csrf,'POST',{type,data})),[csrf]);

  const offer=useCallback(async(restart=false)=>{
    const pc=peer.current,callId=state.current.callId;if(!pc||!callId||!state.current.initiator||pc.signalingState!=='stable')return;
    const description=await pc.createOffer(restart?{iceRestart:true}:undefined);await pc.setLocalDescription(description);
    await signal(callId,'offer',{type:description.type,sdp:description.sdp});
  },[signal]);

  const sample=useCallback(async()=>{
    const pc=peer.current,callId=state.current.callId;if(!pc||!callId||pc.connectionState!=='connected')return;
    const stats=await pc.getStats();let pair:any,bytes=0,lost=0,received=0,jitter:number|null=null;
    stats.forEach((s:any)=>{
      if(s.type==='transport'&&s.selectedCandidatePairId)pair=stats.get(s.selectedCandidatePairId);
      if(s.type==='inbound-rtp'){bytes+=s.bytesReceived||0;lost+=Math.max(0,s.packetsLost||0);received+=s.packetsReceived||0;if(s.kind==='audio'&&typeof s.jitter==='number')jitter=Math.round(s.jitter*1000);}
    });
    if(!pair)stats.forEach((s:any)=>{if(s.type==='candidate-pair'&&s.nominated&&s.state==='succeeded')pair=s;});
    const local=pair?(stats.get(pair.localCandidateId) as any):undefined,remote=pair?(stats.get(pair.remoteCandidateId) as any):undefined;
    const now=Date.now(),before=previous.current;previous.current={bytes,lost,received,at:now};if(!before)return;
    const deltaLost=Math.max(0,lost-before.lost),deltaReceived=Math.max(0,received-before.received);
    const lossPercent=deltaLost+deltaReceived?Math.round(1000*deltaLost/(deltaLost+deltaReceived))/10:0;
    const rttMs=typeof pair?.currentRoundTripTime==='number'?Math.round(pair.currentRoundTripTime*1000):null;
    const bitrateKbps=Math.max(0,Math.round((bytes-before.bytes)*8/(now-before.at)));
    const candidateType=[local?.candidateType,remote?.candidateType].includes('relay')?'relay':local?.candidateType||'unknown';
    const level=lossPercent>8||(rttMs??0)>400||(deltaReceived===0)?'faible':lossPercent>2||(rttMs??0)>200||(jitter??0)>40?'moyenne':'bonne';
    const quality:Quality={level,rttMs,lossPercent,jitterMs:jitter,bitrateKbps,candidateType};
    update({quality});
    // Mesures réseau seulement : ni message ni média. Une perte d'un lot est sans conséquence.
    if(['host','srflx','prflx','relay'].includes(candidateType))
      void api(`/calls/${callId}/quality-samples`,write(csrf,'POST',{samples:[{capturedAt:new Date(now).toISOString(),packetsReceived:deltaReceived,packetsLost:deltaLost,jitterMs:jitter??0,rttMs:rttMs??0,bitrateKbps,candidateType}]})).catch(()=>{});
  },[csrf,update]);

  const createPeer=useCallback(async(initiator:boolean)=>{
    const {iceServers}=await iceConfiguration();
    const pc=new RTCPeerConnection({iceServers,...(relayOnly()?{iceTransportPolicy:'relay' as const}:{})});
    peer.current=pc;const remote=new MediaStream();
    if(initiator){
      media.current?.getTracks().forEach(track=>pc.addTrack(track,media.current!));
      // Une voie vidéo existe même en appel audio, pour le partage d'écran.
      if(!media.current?.getVideoTracks().length)pc.addTransceiver('video',{direction:'sendrecv'});
    }
    pc.onicecandidate=event=>{if(event.candidate&&state.current.callId)void signal(state.current.callId,'ice',event.candidate.toJSON()).catch(()=>{});};
    pc.ontrack=event=>{remote.addTrack(event.track);setRemote(new MediaStream(remote.getTracks()));};
    pc.onconnectionstatechange=()=>{
      if(pc.connectionState==='connected'){update({phase:'active'});if(!timers.current.length)timers.current.push(setInterval(()=>void sample(),5000));}
      // Reprise : l'initiateur relance ICE, par exemple après un changement de réseau.
      if(pc.connectionState==='failed')void offer(true).catch(()=>{});
      if(pc.connectionState==='disconnected')setTimeout(()=>{if(peer.current===pc&&pc.connectionState==='disconnected')void offer(true).catch(()=>{});},4000);
    };
    return pc;
  },[offer,sample,signal,update]);

  const applySignal=useCallback(async({type,data}:Signal)=>{
    const pc=peer.current,callId=state.current.callId;if(!pc||!callId)return;
    if(type==='ice'){if(pc.remoteDescription)await pc.addIceCandidate(data).catch(()=>{});else pendingIce.current.push(data);return;}
    await pc.setRemoteDescription(data);
    for(const candidate of pendingIce.current.splice(0))await pc.addIceCandidate(candidate).catch(()=>{});
    if(type!=='offer')return;
    for(const transceiver of pc.getTransceivers()){
      const kind=transceiver.receiver.track.kind;const track=media.current?.getTracks().find(t=>t.kind===kind)??null;
      transceiver.direction='sendrecv';
      const sharing=kind==='video'?screen.current?.getVideoTracks()[0]:undefined;
      await transceiver.sender.replaceTrack(sharing??track);
    }
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await signal(callId,'answer',{type:answer.type,sdp:answer.sdp});
  },[signal]);

  const connect=useCallback(async()=>{
    update({phase:'connecting'});
    try{await createPeer(true);await offer();}catch{cleanup('Connexion de l’appel impossible.');}
  },[cleanup,createPeer,offer,update]);

  const capture=async(mode:CallMode)=>{
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:mode==='video'});media.current=stream;setLocal(stream);return true;}
    catch{setNotice(mode==='video'?'Autorisez le micro et la caméra pour passer l’appel.':'Autorisez le micro pour passer l’appel.');return false;}
  };

  const leave=useCallback((callId:string,keepalive=false)=>api(`/calls/${callId}/participants/me`,{...write(csrf,'PUT',{state:'left'}),keepalive}).catch(()=>{}),[csrf]);

  /** Rejoint la salle d'une conférence : participation, jeton court, puis connexion au SFU. */
  const enterConference=useCallback(async(callId:string,mode:CallMode)=>{
    update({phase:'connecting',callId,topology:'sfu'});
    const current=()=>state.current.callId===callId;
    try{
      await api(`/calls/${callId}/participants/me`,write(csrf,'PUT',{state:'joined'}));
      const [admission,{iceServers}]=await Promise.all([api<Admission>(`/calls/${callId}/media-tokens`,write(csrf,'POST')),iceConfiguration()]);
      const room=await joinConference(admission,mode==='video',iceServers,relayOnly(),{
        tiles:tiles=>{if(current())update({tiles});},quality:level=>{if(current())update({level});},
        reconnecting:reconnecting=>{if(current())update({reconnecting});},
        closed:()=>{if(current()){cleanup('Conférence terminée.');void leave(callId);}},
      });
      if(!current()){void room.leave();return;}
      conference.current=room;update({phase:'active'});
    }catch(error){
      if(!current())return;
      void leave(callId);
      cleanup(error instanceof ApiError&&error.status===409?'Conférence déjà rejointe sur un autre appareil, ou terminée.':'Impossible de rejoindre la conférence. Vérifiez le micro et la caméra.');
    }
  },[cleanup,csrf,leave,update]);

  const start=useCallback(async(conversationId:string,mode:CallMode,topology:Topology)=>{
    if(state.current.phase!=='idle')return;setNotice('');update({...idle,phase:'outgoing',conversationId,mode,topology,initiator:true});
    try{
      if(topology==='p2p'){
        if(!await holdDirect(conversationId))return;
        if(!await capture(mode)){cleanup();return;}
      }
      const call=await api<CallDto>(`/conversations/${conversationId}/calls`,write(csrf,'POST',{clientId:crypto.randomUUID(),mode}));
      if((state.current as CallView).phase!=='outgoing'){void leave(call.id);return;}
      // Une conférence déjà ouverte dans ce groupe est rejointe plutôt que doublée.
      if(call.topology==='sfu')return void enterConference(call.id,call.mode);
      update({callId:call.id});
      if(lastState.current.get(call.id)==='active')void connect();
      if(lastState.current.get(call.id)==='ended')cleanup(reasons.ended);
    }catch(error){cleanup(error instanceof ApiError&&error.status===409?'Un appel est déjà en cours dans cette conversation.':error instanceof Error?error.message:'Appel impossible.');}
  },[cleanup,connect,csrf,enterConference,holdDirect,leave,update]);

  const accept=useCallback(async()=>{
    const {callId,conversationId,mode,phase,topology}=state.current;if(phase!=='incoming'||!callId||!conversationId)return;
    if(topology==='sfu')return enterConference(callId,mode);
    update({phase:'connecting'});
    try{
      if(!await holdDirect(conversationId))return;
      if(!await capture(mode)){await api(`/calls/${callId}/participants/me`,write(csrf,'PUT',{state:'declined'})).catch(()=>{});cleanup('Appel refusé : micro ou caméra indisponible.');return;}
      // La connexion est prête avant d'accepter : l'offre peut arriver aussitôt.
      await createPeer(false);
      await api(`/calls/${callId}/participants/me`,write(csrf,'PUT',{state:'joined'}));
      for(const item of queued.current.get(callId)??[])chain.current=chain.current.then(()=>applySignal(item)).catch(()=>{});
      queued.current.delete(callId);
    }catch(error){cleanup(error instanceof ApiError&&error.status===409?'Appel déjà pris sur un autre appareil ou terminé.':'Impossible de rejoindre l’appel.');}
  },[applySignal,cleanup,createPeer,csrf,enterConference,holdDirect,update]);

  const decline=useCallback(async()=>{
    const {callId}=state.current;cleanup();
    if(callId)await api(`/calls/${callId}/participants/me`,write(csrf,'PUT',{state:'declined'})).catch(()=>{});
  },[cleanup,csrf]);

  const hangup=useCallback(async()=>{const {callId}=state.current;cleanup('Appel terminé.');if(callId)await leave(callId);},[cleanup,leave]);

  const toggleMute=useCallback(()=>{const muted=!state.current.muted;media.current?.getAudioTracks().forEach(t=>{t.enabled=!muted;});void conference.current?.setMuted(muted);update({muted});},[update]);
  const toggleCamera=useCallback(()=>{const cameraOff=!state.current.cameraOff;media.current?.getVideoTracks().forEach(t=>{t.enabled=!cameraOff;});void conference.current?.setCameraOff(cameraOff);update({cameraOff});},[update]);

  const videoSender=()=>peer.current?.getTransceivers().find(t=>t.receiver.track.kind==='video')?.sender;
  const stopSharing=useCallback(async()=>{
    screen.current?.getTracks().forEach(t=>t.stop());screen.current=null;
    await videoSender()?.replaceTrack(media.current?.getVideoTracks()[0]??null);setLocal(media.current);update({sharing:false});
  },[update]);
  const toggleShare=useCallback(async()=>{
    if(conference.current){
      const sharing=!state.current.sharing;
      try{await conference.current.setSharing(sharing);update({sharing});}catch{setNotice('Partage d’écran annulé ou indisponible.');}
      return;
    }
    if(state.current.sharing)return stopSharing();
    try{
      const display=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});const track=display.getVideoTracks()[0];
      screen.current=display;await videoSender()?.replaceTrack(track);setLocal(display);update({sharing:true});
      track.addEventListener('ended',()=>void stopSharing(),{once:true});
    }catch{setNotice('Partage d’écran annulé ou indisponible.');}
  },[stopSharing,update]);

  const onEvent=useCallback((event:string,data:any)=>{
    if(!userId||!data?.callId)return;
    if(event==='call.invitation'){
      if(state.current.phase==='idle'&&data.initiatorId!==userId){setNotice('');update({...idle,phase:'incoming',callId:data.callId,conversationId:data.conversationId,mode:data.mode,topology:data.topology});}
      return;
    }
    if(event==='call.updated'){
      lastState.current.set(data.callId,data.state);
      if(data.callId!==state.current.callId)return;
      if(data.state==='ended')return cleanup(reasons[data.reason]??reasons.ended);
      // Dans une conférence, « active » signifie seulement qu'un autre membre a rejoint.
      if(data.state==='active'&&state.current.topology==='p2p'){
        if(state.current.phase==='outgoing')void connect();
        // Un autre onglet ou appareil du même compte a répondu.
        else if(state.current.phase==='incoming')cleanup('Appel pris sur un autre appareil.');
      }
      return;
    }
    if(event==='call.signal'){
      const item:Signal={type:data.type,data:data.data};
      if(data.callId!==state.current.callId||!peer.current){queued.current.set(data.callId,[...(queued.current.get(data.callId)??[]),item]);return;}
      chain.current=chain.current.then(()=>applySignal(item)).catch(()=>{setNotice('Un signal de l’appel n’a pas pu être appliqué.');});
    }
  },[applySignal,cleanup,connect,update,userId]);

  /** Après un rechargement ou une reconnexion : retrouve une sonnerie, libère un appel abandonné. */
  const recover=useCallback(async()=>{
    if(!userId||state.current.phase!=='idle')return;
    const {items}=await api<{items:CallDto[]}>('/calls');if(state.current.phase!=='idle')return;
    for(const call of items){
      const incoming=()=>update({...idle,phase:'incoming',callId:call.id,conversationId:call.conversationId,mode:call.mode,topology:call.topology});
      if(call.topology==='sfu'){incoming();return;}
      const release=await lockDirectCall(userId,call.conversationId);
      if(!release)continue;
      try{
        if(state.current.phase!=='idle')return;
        if(call.state==='ringing'&&call.initiatorId!==userId){incoming();return;}
        await leave(call.id);
      }finally{release();}
    }
  },[leave,update,userId]);

  useEffect(()=>{
    // Un changement de réseau pendant une conférence est repris par le SDK du SFU.
    const online=()=>{if(peer.current&&state.current.initiator)void offer(true).catch(()=>{});};
    const pagehide=()=>{const {callId,phase}=state.current;if(callId&&phase!=='incoming')void leave(callId,true);};
    window.addEventListener('online',online);window.addEventListener('pagehide',pagehide);
    return()=>{window.removeEventListener('online',online);window.removeEventListener('pagehide',pagehide);};
  },[leave,offer]);
  useEffect(()=>{if(!userId)cleanup();},[cleanup,userId]);

  return {view,notice,setNotice,localStream,remoteStream,start,accept,decline,hangup,toggleMute,toggleCamera,toggleShare,onEvent,recover};
}
