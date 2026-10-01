import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./public/app.js', import.meta.url), 'utf8');
const start = source.indexOf('async function api(');
const end = source.indexOf('\nfunction toast', start);
assert.notEqual(start, -1, 'api client should exist');
assert.notEqual(end, -1, 'api client should have a bounded source section');
const implementation = source.slice(start, end);

function createApi(fetchImpl) {
  return vm.runInNewContext(`(${implementation.replace('async function api', 'async function')})`, {
    fetch: fetchImpl,
    URL,
    location: { origin: 'https://wis.example' },
    JSON,
    Number,
    Error,
  });
}

test('invalid API responses identify only the endpoint and HTTP status', async () => {
  const api = createApi(async () => new Response('<html>upstream unavailable</html>', {
    status: 503,
    headers: { 'content-type': 'text/html' },
  }));

  await assert.rejects(api('/api/v1/contacts/private-id?search=private-value'), {
    message: 'El servicio local no devolvió una respuesta válida para /api/v1/contacts (HTTP 503).',
  });
});

test('keeps fixed diagnostic routes recognizable and masks unknown non-v1 path segments', async () => {
  const api = createApi(async () => new Response('<html>upstream unavailable</html>', {
    status: 503,
    headers: { 'content-type': 'text/html' },
  }));

  await assert.rejects(api('/api/session/private-id'), {
    message: 'El servicio local no devolvió una respuesta válida para /api/session (HTTP 503).',
  });
  await assert.rejects(api('/api/session/refresh'), {
    message: 'El servicio local no devolvió una respuesta válida para /api/session/refresh (HTTP 503).',
  });
});

test('valid JSON API responses and sanitized API errors retain existing behavior', async () => {
  const rejected = createApi(async () => Response.json({ error: 'unauthorized', hint: 'Sesión vencida.' }, { status: 401 }));
  await assert.rejects(rejected('/api/session'), { message: 'Sesión vencida.' });

  const accepted = createApi(async () => Response.json({ data: { ok: true } }));
  assert.deepEqual(JSON.parse(JSON.stringify(await accepted('/api/session'))), { ok: true });
});
