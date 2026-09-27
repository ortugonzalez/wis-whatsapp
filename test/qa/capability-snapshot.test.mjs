import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEntries, buildSnapshot} from '../../scripts/snapshot-whapi.mjs';

const index = '- [Conversation](https://whapi.readme.io/reference/getchat.md)\n- [New method](https://whapi.readme.io/reference/newmethod)';
test('regeneration preserves prior audit and review date without upgrading implementation', () => {
  const previous = {baileys_audit:{reviewed_at:'2026-09-01',version:'test'},capabilities:[{id:'getchat',status:'partial',endpoint:'/api/v1/conversations?id=UUID',baileys_audit:{support:'local_only',methods:[]}}]};
  const copy = structuredClone(previous);
  const result = buildSnapshot(parseEntries(index), previous, '2026-09-27T00:00:00Z');
  assert.deepEqual(result.baileys_audit, previous.baileys_audit);
  assert.deepEqual(result.capabilities[0].baileys_audit, previous.capabilities[0].baileys_audit);
  assert.equal(result.capabilities[0].status, 'partial');
  assert.equal(result.capabilities[0].endpoint, '/api/v1/conversations?id=UUID');
  assert.equal(result.capabilities[1].status, 'pending');
  assert.equal(Object.hasOwn(result.capabilities[1], 'baileys_audit'), false);
  result.capabilities[0].baileys_audit.methods.push('changed');
  assert.deepEqual(previous, copy);
});
test('refresh preserves prior implementation evidence for existing IDs and leaves only new IDs pending', () => {
  const previous = {capabilities:[{id:'getchat',status:'partial',endpoint:'/api/v1/conversations?id=UUID',screen:'/#inbox',baileys:'local database',test:'test/qa/conversation-details.test.mjs',reason:'Observed local details; history may be partial.',baileys_audit:{support:'local_only',methods:[]}}]};
  const result = buildSnapshot(parseEntries(index), previous, '2026-09-27T00:00:00Z');
  assert.deepEqual(Object.fromEntries(['status','endpoint','screen','baileys','test','reason'].map(key=>[key,result.capabilities[0][key]])),Object.fromEntries(['status','endpoint','screen','baileys','test','reason'].map(key=>[key,previous.capabilities[0][key]])));
  assert.deepEqual(result.capabilities[0].baileys_audit,previous.capabilities[0].baileys_audit);
  assert.equal(result.capabilities[1].status,'pending');
  assert.equal(result.capabilities[1].endpoint,null);
  assert.equal(Object.hasOwn(result.capabilities[1],'baileys_audit'),false);
});
test('a newly appearing ID stays pending even when it is in the bootstrap implementation map', () => {
  const entries=parseEntries('- [Conversation](https://whapi.readme.io/reference/getchat)\n- [Contacts](https://whapi.readme.io/reference/getcontacts)');
  const previous={capabilities:[{id:'getchat',status:'partial',endpoint:'/api/v1/conversations?id=UUID',screen:'/#inbox',test:'test/qa/conversation-details.test.mjs',reason:'Current implementation',baileys_audit:{support:'local_only',methods:[]}}]};
  const result=buildSnapshot(entries,previous,'2026-09-27T00:00:00Z');
  assert.equal(result.capabilities[1].id,'getcontacts');
  assert.equal(result.capabilities[1].status,'pending');
  assert.equal(result.capabilities[1].endpoint,null);
  assert.equal(result.capabilities[1].test,null);
  assert.equal(Object.hasOwn(result.capabilities[1],'baileys_audit'),false);
});
test('empty, duplicate and invalid indexes fail before a snapshot can be built', () => {
  assert.throws(() => parseEntries('unrelated documentation'), /Empty/);
  assert.throws(() => parseEntries(index+'\n- [Duplicate](https://whapi.readme.io/reference/getchat)'), /Duplicate/);
  assert.throws(() => parseEntries('- [Invalid](https://whapi.readme.io/reference/a?secret=x)'), /Invalid/);
  assert.throws(() => buildSnapshot([{id:'wrong',name:'Mismatch',source:'https://whapi.readme.io/reference/other'}]), /Invalid/);
  assert.throws(() => buildSnapshot([]), /Empty/);
});
test('partial indexes cannot erase previously audited methods; fresh inventories remain supported', () => {
  assert.throws(() => buildSnapshot(parseEntries(index), {capabilities:[{id:'retired',baileys_audit:{support:'candidate'}}]}), /omits previously/);
  const result = buildSnapshot(parseEntries(index));
  assert.deepEqual(result.capabilities.map(row=>row.id), ['getchat','newmethod']);
  assert.equal(Object.hasOwn(result,'baileys_audit'), false);
});
test('local operational limits do not become implemented WHAPI subscription quotas', () => {
  const result = buildSnapshot(parseEntries('- [Get limits](https://whapi.readme.io/reference/getlimits)'));
  assert.equal(result.capabilities[0].status, 'unsupported');
  assert.equal(result.capabilities[0].endpoint, '/api/v1/limits');
  assert.match(result.capabilities[0].reason, /no es equivalente/);
});
