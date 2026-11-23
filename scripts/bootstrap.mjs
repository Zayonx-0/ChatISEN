import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// mkcert creates a machine-local CA and asks the OS/browser trust store to trust it.
execFileSync('pnpm', ['install', '--frozen-lockfile'], { stdio: 'inherit' });
mkdirSync('infra/edge/certs', { recursive: true });
execFileSync('mkcert', ['-install'], { stdio: 'inherit' });
execFileSync('mkcert', ['-cert-file', 'infra/edge/certs/localhost.crt', '-key-file', 'infra/edge/certs/localhost.key', 'localhost', '127.0.0.1', '::1'], { stdio: 'inherit' });
