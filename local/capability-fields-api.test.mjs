import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
process.env.WIS_DB_PATH = ':memory:';
const { openDatabase } = await import('./db.mjs');
const { makeServer } = await import('./server.mjs');

test('capability field search requires authentication and returns bounded metadata', async () => {
  const database = openDatabase(':memory:');
  const salt = randomBytes(16).toString('hex');
  const password = randomBytes(24).toString('hex');
  database.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?)").run(`${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
  const server = makeServer(database);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/v1/capability-fields?q=participants`)).status, 401);
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${base}/api/v1/capability-fields?q=x`, { headers: { Cookie: cookie } })).status, 400);
    const response = await fetch(`${base}/api/v1/capability-fields?q=participants&limit=3`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.data.total >= body.data.results.length);
    assert.ok(body.data.results.length <= 3);
    assert.ok(body.data.results.every(row => row.field_path && ['request', 'response'].includes(row.direction)));
    assert.equal(JSON.stringify(body).includes('token'), false);
    const fractional = await fetch(`${base}/api/v1/capability-fields?q=participants&limit=2.5`, { headers: { Cookie: cookie } });
    assert.ok((await fractional.json()).data.results.length <= 2);
  } finally {
    await new Promise(resolve => server.close(resolve));
    database.close();
  }
});
