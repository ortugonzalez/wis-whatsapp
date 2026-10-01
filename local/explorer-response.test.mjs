import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./public/explorer.js', import.meta.url), 'utf8');
const start = source.indexOf('async function observedList(');
const end = source.indexOf('\nfunction catalogReadReason', start);
assert.notEqual(start, -1, 'observedList should exist');
assert.notEqual(end, -1, 'observedList should have a bounded source section');
const implementation = source.slice(start, end);

function createObservedList(fetchImpl) {
  return vm.runInNewContext(`(${implementation.replace('async function observedList', 'async function')})`, {
    fetch: fetchImpl,
    URLSearchParams,
  });
}

test('reports an actionable generic error when an API route returns HTML', async () => {
  const observedList = createObservedList(async () => new Response('<!DOCTYPE html><title>Not found</title>', {
    status: 404,
    headers: { 'content-type': 'text/html' },
  }));

  await assert.rejects(observedList('products'), {
    message: 'El servicio no devolvió una respuesta válida al cargar esta sección.',
  });
});

test('keeps valid JSON API errors and observed rows readable', async () => {
  const rejected = createObservedList(async () => Response.json({ error: 'unauthorized', hint: 'Sesión vencida.' }, { status: 401 }));
  await assert.rejects(rejected('products'), { message: 'Sesión vencida.' });

  const observed = createObservedList(async () => Response.json({ data: [{ id: 'p1' }], meta: { total: 1 } }));
  assert.deepEqual(JSON.parse(JSON.stringify(await observed('products'))), { rows: [{ id: 'p1' }], meta: { total: 1 }, raw: [{ id: 'p1' }] });
});
