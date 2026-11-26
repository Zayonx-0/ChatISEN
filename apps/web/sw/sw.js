// Service worker de la cible : affiche les notifications quand l'onglet est fermé ou masqué.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!['message', 'call'].includes(payload?.type) || typeof payload.conversationId !== 'string') return;
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    if (windows.some(client => client.visibilityState === 'visible')) return; // l'application affiche déjà l'événement
    const name = payload.senderName || 'un contact';
    const call = payload.type === 'call';
    await self.registration.showNotification('ChatISEN', {
      body: call ? `Appel ${payload.mode === 'video' ? 'vidéo' : 'audio'} entrant de ${name}` : `Nouveau message de ${name}`,
      tag: `chatisen-${payload.callId || payload.messageId || payload.conversationId}`,
      requireInteraction: call,
      data: {conversationId: payload.conversationId},
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const conversationId = event.notification.data?.conversationId;
    if (typeof conversationId !== 'string') return;
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const existing = windows.find(client => new URL(client.url).pathname === '/');
    if (existing) { await existing.focus(); existing.postMessage({type: 'open-conversation', conversationId}); return; }
    await self.clients.openWindow('/?conversation=' + encodeURIComponent(conversationId));
  })());
});

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const key = event.oldSubscription?.options.applicationServerKey;
    if (!key) return;
    const subscription = await self.registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: key});
    const profile = await fetch('/api/v1/users/me', {credentials: 'include'});
    if (!profile.ok) { await subscription.unsubscribe(); return; }
    const {csrfToken} = await profile.json();
    const {endpoint, keys} = subscription.toJSON();
    const response = await fetch('/api/v1/push-subscriptions', {method: 'POST', credentials: 'include',
      headers: {'Content-Type': 'application/json', 'x-csrf-token': csrfToken}, body: JSON.stringify({endpoint, keys})});
    if (!response.ok) await subscription.unsubscribe();
  })());
});
