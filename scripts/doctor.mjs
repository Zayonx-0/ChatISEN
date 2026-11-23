import {execFileSync} from 'node:child_process';import {existsSync} from 'node:fs';
console.log(JSON.stringify({node:process.version,platform:process.platform,architecture:process.arch,standalone:existsSync('apps/standalone/server.mjs'),contracts:existsSync('packages/contracts/schemas/http.json'),migrations:existsSync('db/migrations/001_initial.sql')},null,2));
try{execFileSync('docker',['--version'],{stdio:'inherit'})}catch{console.log('docker indisponible: le profil standalone reste disponible')}
