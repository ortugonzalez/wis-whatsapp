import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEntries, buildSnapshot} from '../../scripts/snapshot-whapi.mjs';

const index = '- [Conversation](https://whapi.readme.io/reference/getchat.md)\n- [New method](https://whapi.readme.io/reference/newmethod)';
test('regeneration preserves prior audit and review date without upgrading implementation', () => {
  const previous = {baileys_audit:{reviewed_at:'2026-09-01',version:'test'},capabilities:[{id:'getchat',status:'verified',baileys_audit:{support:'local_only',methods:[]}}]};
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
