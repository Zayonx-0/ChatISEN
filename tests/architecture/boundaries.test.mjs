import test from 'node:test';
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {cycles,violations} from '../../scripts/check-boundaries.mjs';

test('modular monolith: no cycle, facades only, one SQL schema per module',()=>{
  assert.deepEqual(cycles(),[]);
  assert.deepEqual(violations(),[]);
});

test('the boundary check does catch each kind of violation',()=>{
  const at=path=>join(resolve('apps/api/src'),path);
  const check=(path,code)=>violations([at(path)],()=>code);
  assert.equal(check('modules/identity/application.ts',"import {x} from '../groups/index.js';").length,1);
  assert.equal(check('modules/messaging/application.ts',"import {x} from '../groups/application.js';").length,1);
  assert.equal(check('modules/messaging/adapters/out/store.ts','select 1 from groups.members').length,1);
  assert.equal(check('platform/realtime.ts','update identity.users set x=1').length,1);
  assert.equal(check('platform/websocket.ts',"import {x} from '../modules/groups/index.js';").length,1);
  assert.equal(check('modules/calls/domain.ts',"import type {Pool} from 'pg';").length,1);
  assert.equal(check('modules/calls/adapters/out/store.ts','select * from calls where id=$1').length,1);
  assert.deepEqual(cycles({a:['b'],b:['a']}),['a → b → a']);
});
