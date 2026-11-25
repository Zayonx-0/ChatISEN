import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

let failed = false;
function check(name, fn) {
  try { console.log(`OK ${name}: ${fn()}`); }
  catch (error) { failed = true; console.error(`FAIL ${name}: ${error.message}`); }
}
const cmd = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
check('Node.js 24', () => {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw Error(`version ${process.version}; Node 24 requis`);
  return process.version;
});
check('pnpm 10', () => {
  const version = cmd('pnpm', ['--version']);
  if (!version.startsWith('10.')) throw Error(`version ${version}; pnpm 10 requis`);
  return version;
});
check('Docker Compose', () => cmd('docker', ['compose', 'version']));
check('Docker daemon', () => cmd('docker', ['info', '--format', '{{.ServerVersion}}']));
check('mkcert', () => cmd('mkcert', ['-version']));
for (const file of ['pnpm-lock.yaml', 'infra/compose/docker-compose.yml', 'db/migrations/001_initial.sql']) {
  check(file, () => { if (!existsSync(file)) throw Error('fichier absent'); return 'présent'; });
}
if (!existsSync('infra/edge/certs/localhost.crt')) console.log('INFO certificats absents : make bootstrap les créera et installera la CA locale.');
if (failed) process.exitCode = 1;
