import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'chatisen-test-'));
try {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/standalone.test.mjs', 'tests/contract/contract.test.mjs', 'tests/web/quality.test.ts', 'tests/security/standalone-realtime.test.mjs', 'tests/security/livekit-token.test.ts', 'tests/security/push.test.mjs', 'tests/security/push-api.test.mjs', 'tests/architecture/boundaries.test.mjs', 'tests/ops/cd-cible.test.mjs', 'tests/ops/cd-publication.test.mjs', 'tests/ops/ci-gardes.test.mjs', 'tests/ops/api-logging.test.ts', 'tests/ops/edge-contract.test.mjs', 'tests/ops/turn-renewal.test.mjs', 'tests/integration/conformance.test.ts', 'tests/integration/identity/identity.test.ts', 'tests/integration/groups/access-matrix.test.ts', 'tests/integration/messaging/messaging.test.ts', 'tests/integration/messaging/websocket.test.ts', 'tests/integration/files/files.test.ts', 'tests/integration/calls/calls.test.ts', 'tests/integration/quality/quality.test.ts', 'tests/integration/notifications/push.test.ts', 'tests/integration/migration/import-demo.test.ts', 'tests/integration/migration/api-role.test.ts'], {
    stdio: 'inherit', env: { ...process.env, CHATISEN_DATA_FILE: join(dir, 'data.json') }
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
