import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {signAdmission} from '../../apps/api/src/modules/calls/livekit-token.js';

test('LiveKit admission is signed and restricted to one identity and room for five minutes', async () => {
  const now = new Date('2026-11-23T12:34:56.000Z');
  const apiKey = 'test-api-key';
  const apiSecret = 'test-secret-only-for-unit-test';
  const roomName = 'chatisen_9e9ef1ad-b0b8-4a7d-a95c-dc0312203a3e';
  const identity = 'user-id:session-id';
  const issuedAt = now.getTime() / 1000;
  const token = signAdmission(apiKey, apiSecret, roomName, identity, issuedAt, issuedAt + 300);
  const parts = token.split('.');
  assert.equal(parts.length, 3);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  assert.equal(header.alg, 'HS256');
  const expectedSignature = createHmac('sha256', apiSecret).update(`${encodedHeader}.${encodedPayload}`).digest();
  const actualSignature = Buffer.from(encodedSignature, 'base64url');
  assert.equal(actualSignature.length, expectedSignature.length);
  assert.ok(timingSafeEqual(actualSignature, expectedSignature));
  assert.equal(payload.iss, apiKey);
  assert.equal(payload.sub, identity);
  assert.equal(payload.nbf, now.getTime() / 1000);
  assert.equal(payload.exp, now.getTime() / 1000 + 300);
  assert.equal(payload.video.roomJoin, true);
  assert.equal(payload.video.room, roomName);
  assert.equal(payload.video.canPublish, true);
  assert.equal(payload.video.canSubscribe, true);
  for (const privilege of ['roomAdmin', 'roomCreate', 'roomList', 'roomRecord', 'ingressAdmin', 'agent']) {
    assert.notEqual(payload.video[privilege], true, `${privilege} must not be granted`);
  }
});
