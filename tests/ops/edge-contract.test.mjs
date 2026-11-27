import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {request} from 'node:https';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {validateHttpResponse} from '../contract/architecture.mjs';

test('Nginx : réponses OpenAPI et chemins LiveKit du navigateur',async t=>{
  if(process.env.TEST_EDGE!=='1')return t.skip('TEST_EDGE=1 et Docker requis');
  const directory=mkdtempSync(join(tmpdir(),'chatisen-edge-'));
  const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:120_000}).trim();
  let container;
  try{
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-days','1',
      '-keyout',join(directory,'tls.key'),'-out',join(directory,'tls.crt')],{stdio:'ignore'});
    const template=readFileSync('infra/gcp/edge/nginx.conf.template','utf8');
    writeFileSync(join(directory,'nginx.conf.template'),template.replace(/\n}\s*$/, `
      server {
        listen 127.0.0.1:3000;
        location = /readyz { return 200; }
        location = /internal/auth/verify { return 401; }
        location / { return 204; }
      }
      server {
        listen 7880;
        location / { return 200 "$uri;$http_upgrade"; }
      }
    }
    `));
    const image=readFileSync('infra/gcp/edge/Dockerfile','utf8').match(/^FROM (nginx:\S+)$/m)[1];
    container=docker('run','-d','--add-host','api:127.0.0.1','-p','127.0.0.1::8443',
      '-v',`${directory}/nginx.conf.template:/etc/nginx/templates-chatisen/nginx.conf.template:ro`,
      '-v',`${directory}:/etc/nginx/tls:ro`,
      '-v',`${resolve('infra/gcp/edge/entrypoint.sh')}:/test-entrypoint.sh:ro`,
      '-e','ACME_UPSTREAM=127.0.0.1','-e','LB_PUBLIC_IP=192.0.2.1','-e','PROXY_CIDR=192.0.2.0/24',
      '-e','PUBLIC_HOST=localhost','-e','SFU_1_HOST=127.0.0.1','-e','SFU_2_HOST=127.0.0.2',
      '--entrypoint','/bin/sh',image,'/test-entrypoint.sh');
    const port=Number(docker('port',container,'8443/tcp').split(':').at(-1));
    const call=(method,path,headers={})=>new Promise((resolve,reject)=>{
      const req=request({host:'127.0.0.1',port,method,path,headers,rejectUnauthorized:false},response=>{
        let body='';
        response.setEncoding('utf8').on('data',chunk=>body+=chunk).on('end',()=>resolve({statusCode:response.statusCode,headers:response.headers,body}));
      });
      req.on('error',reject);req.setTimeout(2000,()=>req.destroy(new Error('Nginx injoignable')));req.end();
    });
    const deadline=Date.now()+5000;
    while((await call('GET','/healthz-edge').catch(()=>null))?.statusCode!==200){
      if(Date.now()>deadline)assert.fail(docker('logs',container));
      await delay(100);
    }
    const refused=await call('GET','/api/v1/users/me');
    assert.equal(refused.statusCode,401);validateHttpResponse('GET','/api/v1/users/me',refused);
    for(const path of ['/api/v1/sessions','/api/v1/users']){
      const attempts=await Promise.all(Array.from({length:14},()=>call('POST',path)));
      const limited=attempts.filter(response=>response.statusCode===429);
      assert.ok(limited.length,path);
      for(const response of limited)validateHttpResponse('POST',path,response);
    }
    const rtc=await call('GET','/livekit/rtc',{Upgrade:'websocket',Connection:'Upgrade'});
    assert.equal(rtc.statusCode,200);assert.equal(rtc.body,'/rtc;websocket');
    assert.equal((await call('GET','/livekit/rtc/validate')).body,'/rtc/validate;');
    for(const path of ['/livekit','/livekit/','/livekit/twirp','/livekit/twirp/livekit.RoomService/ListRooms','/livekit/rtc/other'])
      assert.equal((await call('GET',path)).statusCode,404,path);
  }finally{
    if(container)docker('rm','-f',container);
    rmSync(directory,{recursive:true,force:true});
  }
});
