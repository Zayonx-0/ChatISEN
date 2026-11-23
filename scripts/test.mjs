import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'chatisen-test-'));
try {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/standalone.test.mjs', 'tests/contract/contract.test.mjs', 'tests/security/standalone-realtime.test.mjs', 'tests/security/fastify-realtime.test.ts', 'tests/integration/c/postgres-repository.test.ts', 'tests/integration/identity/postgres-identity.test.ts'], {
    stdio: 'inherit', env: { ...process.env, CHATISEN_DATA_FILE: join(dir, 'data.json') }
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
