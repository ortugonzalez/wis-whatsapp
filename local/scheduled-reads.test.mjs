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
    const waiting=getScheduledReadStatus(database,start+15*60_000);
    assert.equal(waiting.due,true);
    assert.equal(waiting.blocked_reason,'connection_required');
    database.prepare("UPDATE connections SET status='connected',phone='+5491100005679',expected_phone_e164='+5491100005679' WHERE id='wis-5679'").run();
    assert.equal(getScheduledReadStatus(database,start+15*60_000).blocked_reason,null);
    database.prepare("INSERT INTO read_commands(id,kind,status,created_at,updated_at) VALUES('active-read','all','running',?,?)").run(new Date(start).toISOString(),new Date(start).toISOString());
    assert.equal(getScheduledReadStatus(database,start+15*60_000).blocked_reason,'read_in_progress');
    database.prepare("UPDATE read_commands SET status='done' WHERE id='active-read'").run();

    const first = queueScheduledReadIfDue(database, { now: start + 15 * 60_000, connected: true, id: 'scheduled-1' });
    assert.deepEqual({ status: first.status, kind: first.kind }, { status: 'queued', kind: 'all' });
    assert.equal(database.prepare('SELECT status FROM read_commands WHERE id=?').get(first.id).status, 'pending');
    assert.equal(queueScheduledReadIfDue(database, { now: start + 16 * 60_000, connected: true }).status, 'not_due');

    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(first.id);
    const second = queueScheduledReadIfDue(database, { now: start + 30 * 60_000, connected: true, id: 'scheduled-2' });
    assert.deepEqual({ status: second.status, kind: second.kind }, { status: 'queued', kind: 'blocklist' });
    assert.deepEqual(getScheduledReadStatus(database, start + 30 * 60_000), {
      enabled: true,
      interval_minutes: 15,
      next_run_at: new Date(start + 45 * 60_000).toISOString(),
      next_kind: 'communities',
      last_kind: 'blocklist',
      last_enqueued_at: new Date(start + 30 * 60_000).toISOString(),
      last_status: 'pending',
      due: false,
      blocked_reason: 'not_due',
    });
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(second.id);
    const third = queueScheduledReadIfDue(database, { now: start + 45 * 60_000, connected: true, id: 'scheduled-3' });
    assert.deepEqual({ status: third.status, kind: third.kind }, { status: 'queued', kind: 'communities' });
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(third.id);
    const fourth = queueScheduledReadIfDue(database, { now: start + 60 * 60_000, connected: true, id: 'scheduled-4' });
    assert.equal(fourth.kind, 'catalog');
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(fourth.id);
    const fifth = queueScheduledReadIfDue(database, { now: start + 75 * 60_000, connected: true, id: 'scheduled-5' });
    assert.equal(fifth.kind, 'collections');
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(fifth.id);
    const sixth = queueScheduledReadIfDue(database, { now: start + 90 * 60_000, connected: true, id: 'scheduled-6' });
    assert.equal(sixth.kind, 'newsletters');
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(sixth.id);
    const seventh = queueScheduledReadIfDue(database, { now: start + 105 * 60_000, connected: true, id: 'scheduled-7' });
    assert.equal(seventh.kind, 'account_limits');
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(seventh.id);
    const eighth = queueScheduledReadIfDue(database, { now: start + 120 * 60_000, connected: true, id: 'scheduled-8' });
    assert.equal(eighth.kind, 'account_username');
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(eighth.id);
    const ninth = queueScheduledReadIfDue(database, { now: start + 135 * 60_000, connected: true, id: 'scheduled-9' });
    assert.equal(ninth.kind, 'contact_profiles');
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(ninth.id);
    const tenth = queueScheduledReadIfDue(database, { now: start + 150 * 60_000, connected: true, id: 'scheduled-10' });
    assert.equal(tenth.kind, 'group_requests');
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(tenth.id);
    const eleventh = queueScheduledReadIfDue(database, { now: start + 165 * 60_000, connected: true, id: 'scheduled-11' });
    assert.equal(eleventh.kind, 'avatars');
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(eleventh.id);
    const twelfth = queueScheduledReadIfDue(database, { now: start + 180 * 60_000, connected: true, id: 'scheduled-12' });
    assert.equal(twelfth.kind, 'bot_list');
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(twelfth.id);
    const thirteenth = queueScheduledReadIfDue(database, { now: start + 195 * 60_000, connected: true, id: 'scheduled-13' });
    assert.equal(thirteenth.kind, 'disappearing_mode');
    database.prepare("UPDATE read_commands SET status='done' WHERE id=?").run(thirteenth.id);
    const wrapped = queueScheduledReadIfDue(database, { now: start + 210 * 60_000, connected: true, id: 'scheduled-14' });
    assert.equal(wrapped.kind, 'all');
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

test('scheduled read status projects defaults without writing to a read-only database',()=>{
 const database=openDatabase(':memory:');
 try{database.exec('PRAGMA query_only=ON');const status=getScheduledReadStatus(database,Date.parse('2026-01-01T00:00:00.000Z'));assert.equal(status.enabled,true);assert.equal(status.interval_minutes,15);assert.equal(status.next_run_at,'2026-01-01T00:15:00.000Z');assert.equal(database.prepare("SELECT 1 FROM settings WHERE key='scheduled_reads'").get(),undefined);}finally{database.close();}
});
