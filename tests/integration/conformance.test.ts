import test from 'node:test';
import assert from 'node:assert/strict';
import {operations} from '../contract/architecture.mjs';
import {startApp} from './helpers.js';

test('API first: the code serves exactly the operations of openapi.yaml',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const h=await startApp();
  try{
    await h.app.ready();
    const declared=operations.map(({path,method})=>`${method.toUpperCase()} /api/v1${path.replace(/\{(\w+)\}/g,':$1')}`);
    const missing=declared.filter(operation=>{const [method,url]=operation.split(' ');return !h.app.hasRoute({method:method as 'GET',url});});
    assert.deepEqual(missing,[],'declared but not served');
    // /ws est décrit par asyncapi.yaml.
    const extra=h.routes.filter(route=>route.url.startsWith('/api/')&&route.url!=='/api/v1/ws'&&route.method!=='HEAD'&&route.method!=='OPTIONS')
      .map(route=>`${route.method} ${route.url}`).filter(operation=>!declared.includes(operation));
    assert.deepEqual(extra,[],'served but not declared');
    // Toute opération protégée du contrat refuse un appel anonyme.
    for(const {path,method,operation} of operations){
      if(operation.security?.length===0)continue;
      const url=path.replace(/\{\w+\}/g,'3f2c1a9e-5b7d-4c8e-9a1b-2d3e4f5a6b7c');
      const response=await h.call(undefined,method.toUpperCase() as Parameters<typeof h.call>[1],url,
        operation.requestBody?{}:undefined);
      assert.equal(response.statusCode,401,operation.operationId);
    }
  }finally{await h.close();}
});
