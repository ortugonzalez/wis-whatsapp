import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const matrix = JSON.parse(await readFile(new URL('../public/whapi-capabilities.json', import.meta.url), 'utf8'));

test('getnewsletters stays explicitly partial while using the public known-channel metadata getter', () => {
  const capability = matrix.capabilities.find(row => row.id === 'getnewsletters');
  assert.ok(capability);
  assert.equal(capability.status, 'partial');
  assert.equal(capability.endpoint, '/api/v1/channels');
  assert.equal(capability.baileys_audit.support, 'candidate');
  assert.ok(capability.baileys_audit.methods.some(method => method.name === 'newsletterMetadata'));
  assert.match(capability.baileys_audit.reason, /no expone.*listado remoto global/i);
  assert.match(capability.baileys_audit.next_step, /cobertura parcial/i);
  assert.doesNotMatch(capability.baileys_audit.next_step, /función deshabilitada/i);
});
