import type {Admission} from './calls.js';

export type Tile={key:string;userId:string;local:boolean;screen:boolean;video:MediaStreamTrack|null;audio:MediaStreamTrack|null;muted:boolean;speaking:boolean};
export type ConferenceHandlers={tiles:(tiles:Tile[])=>void;quality:(level:'bonne'|'moyenne'|'faible')=>void;reconnecting:(value:boolean)=>void;closed:()=>void};

/**
 * Salle d'un SFU LiveKit : chaque navigateur envoie un flux et reçoit ceux des autres.
 * Le SDK n'est chargé qu'à la première conférence.
 */
export async function joinConference(admission:Admission,video:boolean,iceServers:RTCIceServer[],relayOnly:boolean,handlers:ConferenceHandlers){
  const {Room,RoomEvent,Track,ConnectionQuality}=await import('livekit-client');
  const room=new Room({dynacast:true});
  let leaving=false;
  const tiles=()=>{
    const speaking=new Set(room.activeSpeakers.map(p=>p.identity));
    handlers.tiles([room.localParticipant,...room.remoteParticipants.values()].flatMap(participant=>{
      const local=participant===room.localParticipant;
      const track=(source:(typeof Track.Source)[keyof typeof Track.Source])=>{const publication=participant.getTrackPublication(source);return publication&&!publication.isMuted?publication.track?.mediaStreamTrack??null:null;};
      const base={userId:participant.identity,local,speaking:speaking.has(participant.identity),muted:!participant.isMicrophoneEnabled};
      const shared=track(Track.Source.ScreenShare);
      return [
        // Son propre micro n'est jamais rejoué.
        {...base,key:participant.identity,screen:false,video:track(Track.Source.Camera),audio:local?null:track(Track.Source.Microphone)},
        ...(shared?[{...base,key:`${participant.identity}:screen`,screen:true,video:shared,audio:null}]:[]),
      ];
    }));
  };
  for(const event of [RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.TrackSubscribed,RoomEvent.TrackUnsubscribed,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished,RoomEvent.ActiveSpeakersChanged] as const)
    room.on(event,tiles);
  room.on(RoomEvent.ConnectionQualityChanged,(quality,participant)=>{
    if(participant!==room.localParticipant)return;
    handlers.quality(quality===ConnectionQuality.Excellent?'bonne':quality===ConnectionQuality.Good?'moyenne':'faible');
  });
  room.on(RoomEvent.Reconnecting,()=>handlers.reconnecting(true));
  room.on(RoomEvent.Reconnected,()=>{handlers.reconnecting(false);tiles();});
  room.on(RoomEvent.Disconnected,()=>{if(!leaving)handlers.closed();});

  await room.connect(admission.serverUrl,admission.token,{rtcConfig:{iceServers,...(relayOnly?{iceTransportPolicy:'relay' as const}:{})}});
  const leave=async()=>{leaving=true;await room.disconnect();};
  try{
    await room.localParticipant.setMicrophoneEnabled(true);
    if(video)await room.localParticipant.setCameraEnabled(true);
  }catch(error){await leave();throw error;}
  tiles();
  return {
    leave,
    setMuted:(muted:boolean)=>room.localParticipant.setMicrophoneEnabled(!muted),
    setCameraOff:(off:boolean)=>room.localParticipant.setCameraEnabled(!off),
    setSharing:(sharing:boolean)=>room.localParticipant.setScreenShareEnabled(sharing),
  };
}
export type Conference=Awaited<ReturnType<typeof joinConference>>;
