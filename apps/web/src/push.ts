import {useCallback,useEffect,useState} from 'react';
import {api,write} from './api.js';

export type PushState='unsupported'|'unavailable'|'denied'|'off'|'on'|'busy';
const supported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const keyBytes=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((value.length+3)%4)),c=>c.charCodeAt(0));
const storageKey='chatisen.push.subscription';
/** Un abonnement n'accepte que les envois signés par la clé avec laquelle il a été créé. */
const sameKey=(subscription:PushSubscription,publicKey:string)=>{
  const used=subscription.options.applicationServerKey;if(!used)return false;
  const expected=keyBytes(publicKey),actual=new Uint8Array(used);
  return actual.length===expected.length&&actual.every((byte,index)=>byte===expected[index]);
};

/** Notifications Web Push : le service worker les affiche même quand l'onglet est fermé. */
export function usePush(userId:string|undefined,csrf:string){
  const [state,setState]=useState<PushState>('busy');const [error,setError]=useState('');

  const register=useCallback(async(subscription:PushSubscription)=>{
    const {endpoint,keys}=subscription.toJSON() as {endpoint:string;keys:{p256dh:string;auth:string}};
    const {id}=await api<{id:string}>('/push-subscriptions',write(csrf,'POST',{endpoint,keys}));
    try{localStorage.setItem(storageKey,id);}catch{/* stockage indisponible */}
  },[csrf]);

  useEffect(()=>{
    if(!userId)return;let active=true;
    (async()=>{
      if(!supported()){setState('unsupported');return;}
      const configuration=await api<{available:boolean;publicKey:string|null}>('/push-configuration');
      if(!configuration.available){if(active)setState('unavailable');return;}
      const worker=await navigator.serviceWorker.register('/sw.js');
      let subscription=await worker.pushManager.getSubscription();
      if(subscription&&!sameKey(subscription,configuration.publicKey!)){await subscription.unsubscribe();subscription=null;}
      // Nouvelle session sur ce navigateur : l'abonnement existant lui est rattaché.
      if(subscription&&Notification.permission==='granted'){await register(subscription);if(active)setState('on');}
      else if(active)setState(Notification.permission==='denied'?'denied':'off');
    })().catch(()=>{if(active)setState('unavailable');});
    return()=>{active=false;};
  },[userId,register]);

  const enable=useCallback(async()=>{
    setError('');setState('busy');
    try{
      if(await Notification.requestPermission()!=='granted'){setState(Notification.permission==='denied'?'denied':'off');return;}
      const {publicKey}=await api<{publicKey:string}>('/push-configuration');
      await navigator.serviceWorker.register('/sw.js');const worker=await navigator.serviceWorker.ready;
      const existing=await worker.pushManager.getSubscription();
      if(existing&&!sameKey(existing,publicKey))await existing.unsubscribe();
      const subscription=(existing&&sameKey(existing,publicKey)?existing:null)??await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
      await register(subscription);setState('on');
    }catch{setState('off');setError('Activation des notifications impossible sur ce navigateur.');}
  },[register]);

  const disable=useCallback(async()=>{
    setState('busy');
    try{
      const worker=await navigator.serviceWorker.getRegistration('/sw.js');await (await worker?.pushManager.getSubscription())?.unsubscribe();
      const id=localStorage.getItem(storageKey);if(id)await api(`/push-subscriptions/${id}`,write(csrf,'DELETE')).catch(()=>{});
      localStorage.removeItem(storageKey);
    }finally{setState('off');}
  },[csrf]);

  return {state,error,enable,disable};
}
