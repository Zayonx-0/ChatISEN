import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

test('TURN: the Certbot deploy hook updates the coturn files for its own lineage and restarts the service',()=>{
  const dir=mkdtempSync(join(process.cwd(),'.turn-test-'));
  try{
    const host='turn.test',log=join(dir,'commands'),lineage=join(dir,'letsencrypt/live',host);
    mkdirSync(lineage,{recursive:true});mkdirSync(join(dir,'chatisen/turn'),{recursive:true});
    writeFileSync(join(lineage,'fullchain.pem'),'renewed certificate');
    writeFileSync(join(lineage,'privkey.pem'),'renewed key');
    writeFileSync(join(dir,'install'),`#!/usr/bin/env bash
set -e
if [[ "$1" == -d ]]; then mkdir -p "$4"; exit; fi
printf '%s\\n' "install $*" >>"$TURN_TEST_LOG"
[[ "$1 $2 $3 $4 $5 $6" == '-m 640 -o 65534 -g 65534' ]]
cp "$7" "$8"
`,{mode:0o755});
    writeFileSync(join(dir,'docker'),`#!/usr/bin/env bash
printf '%s\\n' "docker $*" >>"$TURN_TEST_LOG"
`,{mode:0o755});
    const env={...process.env,PATH:`${dir}:${process.env.PATH}`,TURN_TEST_LOG:log};
    const run=(args,extra={})=>{
      const result=spawnSync('bash',args,{encoding:'utf8',env:{...env,...extra}});
      assert.equal(result.status,0,result.stderr);
    };
    const source=readFileSync(new URL('../../infra/gcp/vm/turn.sh',import.meta.url),'utf8');
    const installHook=source.slice(source.indexOf('\nhooks=')+1).replaceAll('/etc/letsencrypt',join(dir,'letsencrypt')).replaceAll('/opt/chatisen',join(dir,'chatisen'));
    run(['-euc',`host=${host}\n${installHook}`]);
    const hook=join(dir,'letsencrypt/renewal-hooks/deploy/chatisen-turn');
    run([hook],{RENEWED_LINEAGE:join(dir,'letsencrypt/live/other.test')});
    assert.equal(existsSync(log),false);
    run([hook],{RENEWED_LINEAGE:lineage});
    assert.equal(readFileSync(join(dir,'chatisen/turn/cert.pem'),'utf8'),'renewed certificate');
    assert.equal(readFileSync(join(dir,'chatisen/turn/key.pem'),'utf8'),'renewed key');
    const commands=readFileSync(log,'utf8').trim().split('\n');
    assert.equal(commands.length,3);
    assert.equal(commands[2],`docker compose -f ${dir}/chatisen/compose.yml restart coturn`);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
