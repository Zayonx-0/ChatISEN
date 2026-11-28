/**
 * Contrôle d'architecture du monolithe modulaire :
 *  - un module n'importe que la façade index.ts d'un module autorisé par le graphe ;
 *  - une requête SQL ne cite que le schéma de son module (le noyau : « realtime ») ;
 *  - le noyau platform/ n'importe aucun module ;
 *  - domain.ts ne dépend ni de Fastify ni de PostgreSQL.
 */
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const allowed={
  identity:[],
  groups:['identity'],
  files:['groups'],
  calls:['groups'],
  messaging:['groups','files'],
  quality:['calls'],
  notifications:['groups','identity'],
  operations:['identity'],
};
const schemas=[...Object.keys(allowed),'realtime'];
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../apps/api/src');

const sources=directory=>readdirSync(directory).flatMap(name=>{
  const path=join(directory,name);
  return statSync(path).isDirectory()?sources(path):path.endsWith('.ts')?[path]:[];
});
const moduleOf=path=>{const parts=relative(root,path).split(sep);return parts[0]==='modules'?parts[1]:undefined;};

export function violations(files=sources(root),read=path=>readFileSync(path,'utf8')){
  const found=[];
  for(const file of files){
    const code=read(file),own=moduleOf(file),platform=relative(root,file).startsWith(`platform${sep}`),where=relative(root,file);
    for(const [,specifier] of code.matchAll(/(?:from\s+|import\s*\(\s*)'([^']+)'/g)){
      if(file.endsWith(`${sep}domain.ts`)&&/^(fastify|pg|ws|@fastify\/)/.test(specifier))found.push(`${where}: le domaine importe ${specifier}`);
      if(!specifier.startsWith('.'))continue;
      const target=resolve(dirname(file),specifier),other=moduleOf(target);
      if(!other||other===own)continue;
      if(platform)found.push(`${where}: le noyau importe le module ${other}`);
      else if(own){
        if(!allowed[own].includes(other))found.push(`${where}: ${own} ne peut pas dépendre de ${other}`);
        else if(!target.endsWith(`${sep}index.js`))found.push(`${where}: ${own} contourne la façade de ${other}`);
      }
    }
    for(const [,schema] of code.matchAll(/\b(?:from|join|into|update)\s+([a-z_]+)\.[a-z_]+/gi)){
      if(!schemas.includes(schema))continue;
      const expected=platform?'realtime':own;
      if(schema!==expected)found.push(`${where}: requête sur le schéma ${schema}`);
    }
    // Une table citée sans schéma n'appartiendrait à aucun module.
    for(const [,table] of code.matchAll(/\b(?:insert into|delete from|update|from|join)\s+(users|sessions|conversations|conversation_members|members|messages|calls|participants|files|samples|push_subscriptions|push_deliveries|events|streams|outbox|user_events|audit_log|media_jobs|creation_commands)(?=[\s(])/g))
      found.push(`${where}: table ${table} sans schéma`);
  }
  return found;
}

/** Le graphe des dépendances ne doit contenir aucun cycle. */
export function cycles(graph=allowed){
  const state=new Map(),found=[];
  const visit=(name,path)=>{
    if(state.get(name)==='done')return;
    if(state.get(name)==='open'){found.push([...path,name].join(' → '));return;}
    state.set(name,'open');for(const next of graph[name])visit(next,[...path,name]);state.set(name,'done');
  };
  Object.keys(graph).forEach(name=>visit(name,[]));
  return found;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const problems=[...cycles(),...violations()];
  if(problems.length){console.error(problems.join('\n'));process.exit(1);}
  console.log('Frontières des modules respectées.');
}
