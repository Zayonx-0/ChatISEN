import type {MediaServer} from '../../ports.js';
import {signAdmission,signService} from './livekit-token.js';

/** LiveKit auto-hébergé. Absent tant que les quatre réglages ne sont pas fournis. */
export function livekitFromEnv(env:NodeJS.ProcessEnv=process.env):MediaServer|undefined{
  const {LIVEKIT_URL:publicUrl,LIVEKIT_API_URL:apiUrl,LIVEKIT_API_KEY:key,LIVEKIT_API_SECRET:secret}=env;
  const addresses=apiUrl?.split(',').map(url=>url.trim().replace(/\/+$/,'')).filter(Boolean);
  if(!publicUrl||!addresses?.length||!key||!secret)return undefined;
  // API d'administration (Twirp). N'importe quel SFU du cluster la sert, Redis les relie.
  const call=async(method:string,grant:Record<string,unknown>,body:Record<string,unknown>)=>{
    const now=Math.floor(Date.now()/1000);
    const headers={authorization:`Bearer ${signService(key,secret,grant,now,now+60)}`,'content-type':'application/json'};
    let failure:unknown;
    for(const address of addresses){
      try{
        const response=await fetch(`${address}/twirp/livekit.RoomService/${method}`,{method:'POST',signal:AbortSignal.timeout(5000),headers,body:JSON.stringify(body)});
        void response.body?.cancel().catch(()=>{});
        // Une salle ou un participant déjà partis ne sont pas un échec.
        if(response.ok||response.status===404)return;
        failure=new Error(`livekit ${method}: ${response.status}`);
      }catch(error){failure=error;}
    }
    throw failure;
  };
  return {
    admit(room,identity,seconds){
      const now=Math.floor(Date.now()/1000);
      return {serverUrl:publicUrl,token:signAdmission(key,secret,room,identity,now,now+seconds),expiresAt:new Date((now+seconds)*1000).toISOString()};
    },
    removeParticipant:(room,identity)=>call('RemoveParticipant',{roomAdmin:true,room},{room,identity}),
    closeRoom:room=>call('DeleteRoom',{roomCreate:true},{room}),
  };
}
