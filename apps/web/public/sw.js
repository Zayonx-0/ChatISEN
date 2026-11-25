self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload=event.data?.json(); } catch { return; }
    if(payload?.type!=='message'||typeof payload.conversationId!=='string')return;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(windows.some(client=>client.visibilityState==='visible'&&new URL(client.url).pathname==='/'))return;
    await self.registration.showNotification('ChatISEN',{
      body:payload.senderName?`Nouveau message de ${payload.senderName}`:'Vous avez reçu un message.',
      tag:`chatisen-${payload.messageId||payload.conversationId}`,
      data:{conversationId:payload.conversationId},
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const conversationId=event.notification.data?.conversationId;
    if(typeof conversationId!=='string')return;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).pathname==='/');
    if(existing){await existing.focus();existing.postMessage({type:'open-conversation',conversationId});return;}
    await self.clients.openWindow('/?conversation='+encodeURIComponent(conversationId));
  })());
});

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const old=event.oldSubscription;
    if(!old?.options.applicationServerKey)return;
    const subscription=await self.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:old.options.applicationServerKey});
    const profile=await fetch('/api/auth/me',{credentials:'include'});
    if(!profile.ok){await subscription.unsubscribe();return;}
    const {csrf}=await profile.json();
    const response=await fetch('/api/push/subscriptions',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(subscription.toJSON())});
    if(!response.ok)await subscription.unsubscribe();
  })());
});
