import webpush from 'web-push';

const trustedHosts = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]);

function validSubscription(subscription) {
  try {
    if (!subscription || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 2048) return false;
    const endpoint = new URL(subscription.endpoint);
    const trusted = trustedHosts.has(endpoint.hostname) || endpoint.hostname.endsWith('.push.apple.com') || endpoint.hostname.endsWith('.notify.windows.com');
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port || !trusted) return false;
    const {p256dh, auth} = subscription.keys || {};
    if (typeof p256dh !== 'string' || typeof auth !== 'string' || !/^[A-Za-z0-9_-]+$/.test(p256dh) || !/^[A-Za-z0-9_-]+$/.test(auth)) return false;
    const publicKey = Buffer.from(p256dh, 'base64url');
    return publicKey.length === 65 && publicKey[0] === 4 && Buffer.from(auth, 'base64url').length === 16;
  } catch {
    return false;
  }
}

export function createPushService({db, save, member, sender = webpush.sendNotification.bind(webpush), publicKey, privateKey, subject}) {
  db.pushSubscriptions ||= [];
  let configured = false;
  if (publicKey && privateKey && subject) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      configured = true;
    } catch {
      console.error('Notifications push indisponibles : configuration VAPID invalide.');
    }
  }

  function subscribe(user, currentSession, subscription) {
    if (!configured) return 'unavailable';
    if (!validSubscription(subscription)) return 'invalid';
    db.pushSubscriptions = db.pushSubscriptions.filter(item => item.subscription.endpoint !== subscription.endpoint);
    db.pushSubscriptions.push({
      userId: user.id,
      sessionId: currentSession.id,
      subscription: {endpoint: subscription.endpoint, keys: subscription.keys},
      createdAt: new Date().toISOString(),
    });
    save();
    return 'ok';
  }

  function unsubscribe(currentSession, endpoint) {
    const before = db.pushSubscriptions.length;
    db.pushSubscriptions = db.pushSubscriptions.filter(item => !(item.sessionId === currentSession.id && item.subscription.endpoint === endpoint));
    if (db.pushSubscriptions.length !== before) save();
  }

  function revoke(currentSession) {
    const before = db.pushSubscriptions.length;
    db.pushSubscriptions = db.pushSubscriptions.filter(item => item.sessionId !== currentSession.id);
    if (db.pushSubscriptions.length !== before) save();
  }

  async function deliverMessage(conversationId, message, author) {
    if (!configured) return;
    const payload = JSON.stringify({
      type: 'message',
      conversationId,
      messageId: message.id,
      senderName: author.displayName,
    });
    const now = new Date().toISOString();
    const recipients = db.pushSubscriptions.filter(item => {
      const session = db.sessions.find(candidate => candidate.id === item.sessionId);
      return item.userId !== author.id && session?.userId === item.userId && !session.revokedAt && session.expiresAt > now && member(conversationId, item.userId);
    });
    await Promise.allSettled(recipients.map(async item => {
      try {
        await sender(item.subscription, payload, {TTL: 120, timeout: 10000});
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          const before = db.pushSubscriptions.length;
          db.pushSubscriptions = db.pushSubscriptions.filter(current => current !== item);
          if (db.pushSubscriptions.length !== before) save();
        } else {
          console.error('Échec de livraison d’une notification push.');
        }
      }
    }));
  }

  return {available: configured, publicKey: configured ? publicKey : null, subscribe, unsubscribe, revoke, deliverMessage};
}
