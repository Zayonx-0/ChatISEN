import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist', {recursive:true});
console.log('ChatISEN standalone build: static client in apps/web/public, API in apps/standalone/server.mjs');
