import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';

process.env.WIS_DB_PATH = ':memory:';
const { openDatabase } = await import('./db.mjs');
const { makeServer } = await import('./server.mjs');

test('administrator can inspect, pause and configure bounded scheduled read-only sync', async () => {
  const database = openDatabase(':memory:');
  const salt = randomBytes(16).toString('hex');
  const password = randomBytes(24).toString('hex');
  database.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?)").run(`${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
  const server = makeServer(database);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/v1/settings`)).status, 401);
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
    const initial = await (await fetch(`${base}/api/v1/settings`, { headers })).json();
    assert.equal(initial.data.scheduled_reads.enabled, true);
    assert.equal(initial.data.scheduled_reads.interval_minutes, 15);
    const paused = await fetch(`${base}/api/v1/settings`, { method: 'PATCH', headers, body: JSON.stringify({ scheduled_reads_enabled: false, scheduled_reads_interval_minutes: 30 }) });
    assert.equal(paused.status, 200);
    const pausedData = (await paused.json()).data.scheduled_reads;
    assert.equal(pausedData.enabled, false);
    assert.equal(pausedData.interval_minutes, 30);
    const invalid = await fetch(`${base}/api/v1/settings`, { method: 'PATCH', headers, body: JSON.stringify({ scheduled_reads_enabled: true, scheduled_reads_interval_minutes: 5 }) });
    assert.equal(invalid.status, 400);
    assert.equal(database.prepare('SELECT count(*) AS n FROM read_commands').get().n, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    database.close();
  }
});

test('local server timer enqueues one due route only while the existing connection is active', async () => {
  const database = openDatabase(':memory:');
  database.prepare("UPDATE connections SET status='connected',phone='+5491100005679',expected_phone_e164='+5491100005679' WHERE id='wis-5679'").run();
  database.prepare("INSERT INTO settings(key,value) VALUES('scheduled_reads',?)").run(JSON.stringify({ enabled: true, interval_minutes: 15, cursor: 0, next_run_at: new Date(Date.now() - 60_000).toISOString(), last_kind: null, last_command_id: null, last_enqueued_at: null }));
  const server = makeServer(database, { scheduledReadIntervalMs: 5 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const deadline = Date.now() + 500;
    while (!database.prepare("SELECT 1 FROM read_commands WHERE status='pending'").get() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    const commands = database.prepare('SELECT kind,status FROM read_commands').all();
    assert.deepEqual(commands.map(({ kind, status }) => ({ kind, status })), [{ kind: 'all', status: 'pending' }]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    database.close();
  }
});
