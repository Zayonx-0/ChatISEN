import test from 'node:test';
import assert from 'node:assert/strict';
import {contract,startApp} from './helpers.js';

test('API first: the code serves exactly the operations of openapi.yaml',async t=>{
  if(!process.env.DATABASE_URL)return t.skip('DATABASE_URL not set');
  const h=await startApp();
  try{
    await h.app.ready();
    const declared:string[]=[];
    for(const [path,item] of Object.entries<Record<string,unknown>>(contract.paths))
      for(const method of ['get','post','put','patch','delete'])
        if(item[method])declared.push(`${method.toUpperCase()} /api/v1${path.replace(/\{(\w+)\}/g,':$1')}`);
    const missing=declared.filter(operation=>{const [method,url]=operation.split(' ');return !h.app.hasRoute({method:method as 'GET',url});});
    assert.deepEqual(missing,[],'declared but not served');
    // /ws est décrit par asyncapi.yaml.
    const extra=h.routes.filter(route=>route.url.startsWith('/api/')&&route.url!=='/api/v1/ws'&&route.method!=='HEAD'&&route.method!=='OPTIONS')
      .map(route=>`${route.method} ${route.url}`).filter(operation=>!declared.includes(operation));
    assert.deepEqual(extra,[],'served but not declared');
    // Toute opération protégée du contrat refuse un appel anonyme.
    for(const operation of declared){
      const [method,url]=operation.split(' ');
      const path=url.replace('/api/v1','').replace(/:(\w+)/g,'{$1}');
      if(contract.paths[path][method.toLowerCase()].security?.length===0)continue;
      const response=await h.app.inject({method:method as 'GET',url:url.replace(/:\w+/g,'3f2c1a9e-5b7d-4c8e-9a1b-2d3e4f5a6b7c'),headers:{origin:'https://chatisen.test'},...(method==='GET'||method==='DELETE'?{}:{payload:{}})});
      assert.equal(response.statusCode,401,operation);
    }
  }finally{await h.close();}
});
