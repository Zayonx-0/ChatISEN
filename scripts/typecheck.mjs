import { spawnSync } from 'node:child_process';
const result = spawnSync('pnpm', ['-r', '--if-present', 'typecheck'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
