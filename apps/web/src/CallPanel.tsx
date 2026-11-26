import React,{useEffect,useRef} from 'react';
import type {useCalls} from './calls.js';

function Media({stream,muted,label,className}:{stream:MediaStream|null;muted?:boolean;label:string;className:string}){
  const ref=useRef<HTMLVideoElement>(null);
  useEffect(()=>{if(ref.current&&ref.current.srcObject!==stream){ref.current.srcObject=stream;if(stream)void ref.current.play().catch(()=>{});}},[stream]);
  return <video ref={ref} className={className} aria-label={label} autoPlay playsInline muted={muted}/>;
}

export function CallPanel({calls,peerName}:{calls:ReturnType<typeof useCalls>;peerName:string}){
  const {view}=calls;if(view.phase==='idle')return null;
  const kind=view.mode==='video'?'vidéo':'audio';
  if(view.phase==='incoming')return <div className="call-layer"><section className="call-card" role="dialog" aria-label="Appel entrant"><h2>Appel entrant</h2><p>{peerName} · appel {kind}</p><div className="call-actions"><button className="primary" onClick={()=>void calls.accept()}>Accepter</button><button className="danger" onClick={()=>void calls.decline()}>Refuser</button></div></section></div>;
  const status=view.phase==='outgoing'?'Sonnerie en cours…':view.phase==='connecting'?'Connexion…':'En communication';
  const quality=view.quality;
  return <div className="call-layer"><section className={`call-card in-call ${view.mode}`} role="dialog" aria-label="Appel en cours">
    <h2>{peerName}</h2><p role="status">Appel {kind} · {status}</p>
    <div className="call-videos"><Media stream={calls.remoteStream} label="Média du correspondant" className="remote"/><Media stream={calls.localStream} muted label="Votre aperçu" className="local"/></div>
    {quality&&<p className={`quality ${quality.level}`} aria-label="Qualité de la communication">Qualité {quality.level} · {quality.rttMs??'?'} ms · pertes {quality.lossPercent} % · {quality.bitrateKbps} kbit/s · {quality.candidateType==='relay'?'relais TURN':'connexion directe'}</p>}
    <div className="call-actions">
      <button onClick={calls.toggleMute} aria-pressed={view.muted}>{view.muted?'Réactiver le micro':'Couper le micro'}</button>
      {view.mode==='video'&&<button onClick={calls.toggleCamera} aria-pressed={view.cameraOff}>{view.cameraOff?'Réactiver la caméra':'Couper la caméra'}</button>}
      <button onClick={()=>void calls.toggleShare()} aria-pressed={view.sharing} disabled={view.phase!=='active'}>{view.sharing?'Arrêter le partage':'Partager l’écran'}</button>
      <button className="danger" onClick={()=>void calls.hangup()}>Raccrocher</button>
    </div>
  </section></div>;
}
