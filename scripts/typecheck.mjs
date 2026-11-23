import {readFile} from 'node:fs/promises';
const files=['apps/standalone/server.mjs','apps/web/public/index.html','packages/contracts/src/index.mjs','db/migrate.mjs'];
for(const f of files){const s=await readFile(f,'utf8');if(!s.trim())throw Error(`empty ${f}`);console.log(`ok ${f}`)}
