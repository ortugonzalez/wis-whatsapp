import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { searchCapabilityFields } from './capability-fields.mjs';

test('searches only documented field metadata and applies a result limit', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'wis-fields-'));
  try {
    await mkdir(resolve(root, 'public'));
    await writeFile(resolve(root, 'public/whapi-fields.json'), JSON.stringify({
      captured_at: '2026-09-27T00:00:00.000Z', source: 'public-reference', methods: [{
        id: 'getmessages', version: '1.8.7',
        operations: [{ method: 'GET', path: '/messages', operation_id: 'getMessages', tags: ['Messages'],
          parameters: [{ name: 'token', in: 'header', example: 'should-not-leak' }],
          request_fields: [{ path: 'chat_id', type: 'string', required: true }],
          response_fields: { 200: [{ path: 'messages[].id', type: 'string' }, { path: 'messages[].body', type: 'string', description: 'Text body' }] },
        }],
      }],
    }));
    const result = await searchCapabilityFields(root, 'messages', 2);
    assert.equal(result.total, 3);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].direction, 'request');
    assert.equal(result.results[0].required, true);
    assert.equal(JSON.stringify(result).includes('should-not-leak'), false);
    assert.equal(JSON.stringify(result).includes('token'), false);
    assert.equal((await searchCapabilityFields(root, 'x')).total, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
