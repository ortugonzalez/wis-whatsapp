import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './db.mjs';
import { getScheduledReadSettings, getScheduledReadStatus, queueScheduledReadIfDue, updateScheduledReadSettings } from './scheduled-reads.mjs';

test('scheduled read-only observations wait 15 minutes, rotate, and do not overlap queued reads', () => {
  const database = openDatabase(':memory:');
  try {
    const start = Date.parse('2026-01-01T00:00:00.000Z');
    const initial = getScheduledReadSettings(database, start);
    assert.equal(initial.enabled, true);
    assert.equal(initial.interval_minutes, 15);
    assert.equal(Date.parse(initial.next_run_at), start + 15 * 60_000);
    assert.equal(queueScheduledReadIfDue(database, { now: start + 15 * 60_000, connected: false }).status, 'disconnected');

    const first = queueScheduledReadIfDue(database, { now: start + 15 * 60_000, connected: true, id: 'scheduled-1' });
    assert.deepEqual({ status: first.status, kind: first.kind }, { status: 'queued', kind: 'all' });
    assert.equal(database.prepare('SELECT status FROM read_commands WHERE id=?').get(first.id).status, 'pending');
    assert.equal(queueScheduledReadIfDue(database, { now: start + 16 * 60_000, connected: true }).status, 'not_due');

    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(first.id);
    const second = queueScheduledReadIfDue(database, { now: start + 30 * 60_000, connected: true, id: 'scheduled-2' });
    assert.deepEqual({ status: second.status, kind: second.kind }, { status: 'queued', kind: 'blocklist' });
    assert.equal(getScheduledReadStatus(database, start + 30 * 60_000).last_status, 'pending');
  } finally {
    database.close();
  }
});

test('manual pending reads defer schedule without advancing its route or due time', () => {
  const database = openDatabase(':memory:');
  try {
    const start = Date.parse('2026-01-01T00:00:00.000Z');
    const dueAt = Date.parse(getScheduledReadSettings(database, start).next_run_at);
    database.prepare("INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES('manual','groups','pending',?,?)").run(new Date(dueAt).toISOString(), new Date(dueAt).toISOString());
    assert.equal(queueScheduledReadIfDue(database, { now: dueAt, connected: true }).status, 'read_in_progress');
    const state = getScheduledReadSettings(database, dueAt);
    assert.equal(state.cursor, 0);
    assert.equal(Date.parse(state.next_run_at), dueAt);
    database.prepare("UPDATE read_commands SET status='done' WHERE id='manual'").run();
    assert.equal(queueScheduledReadIfDue(database, { now: dueAt, connected: true, id: 'scheduled' }).kind, 'all');
  } finally {
    database.close();
  }
});

test('administrator schedule changes can pause reads and move the interval', () => {
  const database = openDatabase(':memory:');
  try {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    updateScheduledReadSettings(database, { enabled: false, interval_minutes: 30 }, now);
    assert.equal(queueScheduledReadIfDue(database, { now: now + 60 * 60_000, connected: true }).status, 'disabled');
    const enabled = updateScheduledReadSettings(database, { enabled: true, interval_minutes: 30 }, now);
    assert.equal(Date.parse(enabled.next_run_at), now + 30 * 60_000);
    assert.throws(() => updateScheduledReadSettings(database, { enabled: true, interval_minutes: 5 }, now), /invalid_scheduled_read_settings/);
  } finally {
    database.close();
  }
});

test('corrupt persisted schedule state resets to a bounded future run', () => {
  const database = openDatabase(':memory:');
  try {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    database.prepare("INSERT INTO settings(key,value) VALUES('scheduled_reads',?)").run(JSON.stringify({ enabled: true, interval_minutes: 15, cursor: 0, next_run_at: 'invalid', last_kind: null }));
    const recovered = getScheduledReadSettings(database, now);
    assert.equal(Date.parse(recovered.next_run_at), now + 15 * 60_000);
    assert.equal(queueScheduledReadIfDue(database, { now, connected: true }).status, 'not_due');
  } finally {
    database.close();
  }
});
