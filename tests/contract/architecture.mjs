import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {parse} from 'yaml';

function readContract(name){
  return parse(readFileSync(new URL(`../../docs/architecture/api/${name}.yaml`,import.meta.url),'utf8'));
}
export const openapi=readContract('openapi'),asyncapi=readContract('asyncapi');

const rest=addFormats(new Ajv2020({strict:false,allErrors:true}));
const realtime=addFormats(new Ajv({strict:false,allErrors:true}));
rest.addSchema(openapi,'openapi');
realtime.addSchema({components:asyncapi.components},'asyncapi');

export function resolve(document,pointer){
  assert.ok(pointer.startsWith('#/'),pointer);
  let node=document;
  for(const segment of pointer.slice(2).split('/')){
    const key=segment.replaceAll('~1','/').replaceAll('~0','~');
    assert.ok(node&&Object.hasOwn(node,key),`Référence inconnue ${pointer}`);
    node=node[key];
  }
  return node;
}
export function checkReferences(document,node=document){
  if(!node||typeof node!=='object')return;
  if(node.$ref)resolve(document,node.$ref);
  for(const child of Object.values(node))checkReferences(document,child);
}
const dereference=(document,node)=>node.$ref?resolve(document,node.$ref):node;
const methods=['get','post','put','patch','delete'];
export const operations=Object.entries(openapi.paths).flatMap(([path,item])=>methods
  .filter(method=>item[method]).map(method=>({path,method,operation:item[method]})));

const responseValidators=new Map(operations.map(({path,method,operation})=>{
  const responses=Object.entries(operation.responses).map(([status,response])=>{
    const {content}=dereference(openapi,response);
    const pointer=response.$ref??`#/paths/${path.replaceAll('/','~1')}/${method}/responses/${status}`;
    const validate=content&&rest.getSchema(`openapi${pointer}/content/application~1json/schema`);
    if(content)assert.ok(validate,`${method} ${path} ${status}: schéma de réponse absent`);
    return [status,validate];
  });
  return [`${method} ${path}`,new Map(responses)];
}));

export function validateHttpResponse(method,url,response){
  const segments=url.split('?')[0].replace(/^\/api\/v1/,'').split('/');
  const route=operations.find(route=>{
    const pattern=route.path.split('/');
    return route.method===method.toLowerCase()&&pattern.length===segments.length
      &&pattern.every((part,i)=>part===segments[i]||(part.startsWith('{')&&segments[i]));
  });
  assert.ok(route,`Opération absente du contrat : ${method} ${url}`);
  const validators=responseValidators.get(`${route.method} ${route.path}`);
  const status=String(response.statusCode),context=`${method} ${route.path} → ${status}`;
  assert.ok(validators.has(status),`${context}: statut absent du contrat`);
  const validate=validators.get(status);
  if(!validate){assert.equal(response.body,'',`${context}: corps inattendu`);return;}
  assert.match(String(response.headers['content-type']),/^application\/json(?:;|$)/i,context);
  assert.ok(validate(JSON.parse(response.body)),`${context}: ${rest.errorsText(validate.errors)}`);
}

export function matchesHttpSchema(name,value){
  const validate=rest.getSchema(`openapi#/components/schemas/${name}`);
  assert.ok(validate,`Schéma inconnu : ${name}`);
  assert.ok(validate(value),`${name}: ${rest.errorsText(validate.errors)}`);
}

const wsValidators={receive:new Map(),send:new Map()};
for(const {action,messages} of Object.values(asyncapi.operations))for(const {$ref} of messages){
  const component=resolve(asyncapi,$ref).$ref;
  const message=resolve(asyncapi,component);
  const validate=realtime.getSchema(`asyncapi${component}/payload`);
  assert.ok(validate,message.name);
  wsValidators[action].set(message.name,validate);
}
export function validateWsFrame(action,frame){
  const name=frame?.type==='event'||frame?.type==='user_event'?frame.event:frame?.type;
  const validate=wsValidators[action].get(name);
  assert.ok(validate,`Trame absente du contrat ${action} : ${name}`);
  assert.ok(validate(frame),`${action} ${name}: ${realtime.errorsText(validate.errors)}`);
}
