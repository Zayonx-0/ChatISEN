import http from 'k6/http';
import ws from 'k6/ws';
import { randomBytes } from 'k6/crypto';
import { Rate, Trend } from 'k6/metrics';

const origin = (__ENV.BASE_URL || '').replace(/\/$/, '');
if (!/^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(origin)) {
  throw new Error('BASE_URL doit être une origine HTTPS de banc, sans chemin.');
}
const api = origin + '/api/v1';
const socketUrl = api.replace(/^https:/, 'wss:') + '/ws';
const cookieName = '__Host-chatisen';
const plateauSpec = (__ENV.LOAD_STAGES || '1:45,2:45,3:45').split(',');
if (!plateauSpec.every(item => /^[1-9]\d{0,3}:[1-9]\d{1,3}$/.test(item) && Number(item.split(':')[1]) >= 20)) {
  throw new Error('LOAD_STAGES attend des couples VU:secondes, avec au moins 20 s par palier.');
}
function limit(name, fallback, min, max) {
  const value = Number(__ENV[name] ?? fallback);
  if (!Number.isFinite(value) || value <= min || value > max) throw new Error(name + ' hors plage.');
  return value;
}
const restLimit = limit('REST_P95_MS', 500, 0, 10000);
const deliveryLimit = limit('DELIVERY_P95_MS', 1000, 0, 10000);
const errorLimit = limit('ERROR_RATE', 0.01, 0, 1);
const gap = 20;
let start = 0;
const scenarios = {};
const thresholds = {};
for (const [index, item] of plateauSpec.entries()) {
  const [vus, duration] = item.split(':').map(Number);
  const name = 'palier_' + (index + 1);
  scenarios[name] = {
    executor: 'constant-vus', vus, duration: duration + 's', startTime: start + 's',
    gracefulStop: gap + 's', tags: { plateau: name, vus: String(vus), duration_s: String(duration) },
  };
  start += duration + gap;
  thresholds['rest_ms{plateau:' + name + '}'] = ['p(95)<' + restLimit];
  thresholds['delivery_ms{plateau:' + name + '}'] = ['p(95)<' + deliveryLimit];
  for (const metric of ['rest_errors', 'ws_errors', 'delivery_errors']) {
    thresholds[metric + '{plateau:' + name + '}'] = ['rate<' + errorLimit];
  }
}
export const options = {
  scenarios, thresholds, redirects: 0,
  systemTags: ['status', 'method', 'scenario', 'expected_response', 'error_code'],
};

const restMs = new Trend('rest_ms', true);
const wsMs = new Trend('ws_ms', true);
const deliveryMs = new Trend('delivery_ms', true);
const restErrors = new Rate('rest_errors');
const wsErrors = new Rate('ws_errors');
const deliveryErrors = new Rate('delivery_errors');
const headers = { Origin: origin, 'Content-Type': 'application/json' };
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const seq = /^(0|[1-9]\d*)$/;

function hex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function messageId() {
  const bytes = new Uint8Array(randomBytes(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const id = hex(bytes);
  return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join('-');
}

function params(session, write = false) {
  const requestHeaders = { ...headers };
  if (session && write) requestHeaders['X-CSRF-Token'] = session.csrf;
  const jar = new http.CookieJar();
  if (session) jar.set(origin, cookieName, session.cookie, { path: '/', secure: true });
  return { headers: requestHeaders, jar, timeout: '3s' };
}

function json(response) {
  try { return response.json(); } catch { return null; }
}

function revoke(session) {
  const response = http.del(api + '/sessions/current', null, params(session, true));
  if (response.status !== 204) console.warn('Révocation de session e2e_ non confirmée (HTTP ' + response.status + ').');
}

export function setup() {
  const sessions = [];
  const run = hex(new Uint8Array(randomBytes(8)));
  try {
    for (const slot of ['a', 'b']) {
      const handle = 'e2e_' + run + '_' + slot;
      const password = hex(new Uint8Array(randomBytes(24)));
      const response = http.post(api + '/users', JSON.stringify({ handle, displayName: handle, password }), params());
      const profile = json(response);
      const cookie = response.cookies[cookieName]?.[0]?.value;
      if (response.status !== 201 || !uuid.test(profile?.id) || !profile?.csrfToken || !cookie) {
        throw new Error('Inscription de banc impossible (HTTP ' + response.status + '). Arrêt sans nouvelle tentative.');
      }
      sessions.push({ id: profile.id, csrf: profile.csrfToken, cookie });
    }
    const response = http.post(api + '/conversations', JSON.stringify({ peerId: sessions[1].id }), params(sessions[0], true));
    const conversation = json(response);
    if (![200, 201].includes(response.status) || !uuid.test(conversation?.id) ||
        typeof conversation.lastSeq !== 'string' || !seq.test(conversation.lastSeq)) {
      throw new Error('Conversation de banc indisponible (HTTP ' + response.status + ').');
    }
    return { sessions, conversationId: conversation.id, initialSeq: conversation.lastSeq };
  } catch (error) {
    for (const session of sessions) revoke(session);
    throw error;
  }
}

export function teardown({ sessions }) {
  for (const session of sessions) revoke(session);
}

function recordRest(response, ok, operation) {
  if (response.status > 0) restMs.add(response.timings.duration, { operation });
  restErrors.add(!ok, { operation });
}

export default function ({ sessions: [sender, receiver], conversationId, initialSeq }) {
  const path = api + '/conversations/' + conversationId + '/messages';
  const history = http.get(path + '?limit=1', params(receiver));
  const items = json(history)?.items;
  const afterSeq = items?.length === 0 ? initialSeq : items?.[0]?.seq;
  const historyOk = history.status === 200 && Array.isArray(items) && typeof afterSeq === 'string' && seq.test(afterSeq);
  recordRest(history, historyOk, 'historique');
  if (!historyOk) {
    deliveryErrors.add(true);
    return;
  }

  const clientId = messageId();
  const started = Date.now();
  let sentAt, deliveredIn;
  let subscribed = false;
  let completed = false;
  let wsFailed = false;
  let response;
  try {
    const wsHeaders = { Origin: origin, Cookie: cookieName + '=' + receiver.cookie };
    response = ws.connect(socketUrl, { headers: wsHeaders }, socket => {
      socket.on('open', () => wsMs.add(Date.now() - started));
      socket.on('error', () => { wsFailed = true; });
      socket.on('message', raw => {
        let frame;
        try { frame = JSON.parse(raw); } catch { wsFailed = true; socket.close(); return; }
        if (frame?.v !== 1) { wsFailed = true; socket.close(); return; }
        if (frame.type === 'ready') {
          socket.send(JSON.stringify({ v: 1, type: 'subscribe', conversationId, afterSeq }));
        } else if (frame.type === 'subscribed' && frame.conversationId === conversationId && !subscribed) {
          subscribed = true;
          sentAt = Date.now();
          const posted = http.post(path, JSON.stringify({ clientId, text: 'Message de banc e2e' }), params(sender, true));
          const ok = [200, 201].includes(posted.status) && json(posted)?.clientId === clientId;
          recordRest(posted, ok, 'envoi');
          if (!ok) sentAt = undefined;
        } else if (frame.type === 'event' && frame.conversationId === conversationId &&
                   frame.event === 'message.created' && frame.data?.clientId === clientId &&
                   sentAt !== undefined && deliveredIn === undefined) {
          deliveredIn = Date.now() - sentAt;
        } else if (['error', 'resync_required'].includes(frame.type)) {
          wsFailed = true;
          socket.close();
        }
      });
      socket.setTimeout(() => {
        completed = true;
        socket.close();
      }, 12000);
    });
  } catch {
    wsFailed = true;
  }
  wsErrors.add(response?.status !== 101 || !subscribed || !completed || wsFailed);
  deliveryErrors.add(deliveredIn === undefined);
  if (deliveredIn !== undefined) deliveryMs.add(deliveredIn);
}
