import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { listCapabilityFields, searchCapabilityFields } from './capability-fields.mjs';

test('searches only documented field metadata and applies a result limit', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'wis-fields-'));
  try {
    await mkdir(resolve(root, 'public'));
    await writeFile(resolve(root, 'public/whapi-fields.json'), JSON.stringify({
      captured_at: '2026-09-27T00:00:00.000Z', source: 'public-reference', methods: [{
        id: 'getmessages', version: '1.8.7',
        operations: [{ method: 'GET', path: '/messages', operation_id: 'getMessages', tags: ['Messages'],
          parameters: [{ name: 'page_size', in: 'query', type: 'integer', required: false, enum: [25, 50], example: 'should-not-leak' }],
          request_fields: [{ path: 'chat_id', type: 'string', required: true }],
          response_fields: { 200: [{ path: 'messages[].id', type: 'string' }, { path: 'messages[].body', type: 'string', description: 'Text body', enum: ['text', 'image'] }] },
        }],
      }],
    }));
    const result = await searchCapabilityFields(root, 'messages', 2);
    assert.equal(result.total, 4);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].direction, 'parameter');
    assert.equal(result.results[0].location, 'query');
    assert.equal(result.results[0].required, false);
    assert.deepEqual(result.results[0].enum_values, ['25', '50']);
    assert.equal(JSON.stringify(result).includes('should-not-leak'), false);
    const page = await listCapabilityFields(root, 2, 1);
    assert.equal(page.total, 4);
    assert.equal(page.results.length, 2);
    assert.equal(page.results[0].direction, 'request');
    const nextSearchPage = await searchCapabilityFields(root, 'messages', 2, 2);
    assert.deepEqual(nextSearchPage.results.map(row => row.field_path), ['messages[].id', 'messages[].body']);
    assert.equal(nextSearchPage.results[1].response_status, '200');
    assert.deepEqual(nextSearchPage.results[1].enum_values, ['text', 'image']);
    assert.equal(nextSearchPage.results[1].enum_truncated, false);
    assert.equal((await searchCapabilityFields(root, 'x')).total, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
