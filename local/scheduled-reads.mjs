import { randomUUID } from 'node:crypto';

export const SCHEDULED_READ_KINDS = Object.freeze(['all', 'blocklist', 'communities', 'catalog', 'collections', 'newsletters', 'account_limits', 'account_username', 'contact_profiles', 'group_requests', 'avatars', 'bot_list', 'disappearing_mode', 'community_subgroups']);
export const SCHEDULED_READ_INTERVALS = Object.freeze([15, 30, 60, 120]);
const SETTING_KEY = 'scheduled_reads';

function initialSchedule(now) {
  return {
    enabled: true,
    interval_minutes: 15,
    cursor: 0,
    next_run_at: new Date(now + 15 * 60_000).toISOString(),
    last_kind: null,
    last_command_id: null,
    last_enqueued_at: null,
  };
}

function readStored(database) {
  const row = database.prepare('SELECT value FROM settings WHERE key=?').get(SETTING_KEY);
  if (!row) return null;
  try {
    const value = JSON.parse(row.value);
    const validNextRun = value.next_run_at === null || (typeof value.next_run_at === 'string' && Number.isFinite(Date.parse(value.next_run_at)));
    if (typeof value.enabled !== 'boolean' || !SCHEDULED_READ_INTERVALS.includes(value.interval_minutes) || !Number.isInteger(value.cursor) || value.cursor < 0 || value.cursor >= SCHEDULED_READ_KINDS.length || !validNextRun || (value.enabled && value.next_run_at === null) || (value.last_kind !== null && !SCHEDULED_READ_KINDS.includes(value.last_kind))) return null;
    return { ...initialSchedule(Date.now()), ...value };
  } catch {
    return null;
  }
}

function writeStored(database, schedule) {
  database.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(SETTING_KEY, JSON.stringify(schedule));
}

function nextKnownCommunity(database) {
  return database.prepare(`SELECT c.resource_id
    FROM snapshots c
    LEFT JOIN snapshots r ON r.kind='community_subgroups' AND r.resource_id=c.resource_id
    WHERE c.kind='community' AND c.resource_id LIKE '%@g.us' AND json_extract(c.payload,'$.isCommunity')=1
    ORDER BY coalesce(r.updated_at,''),c.resource_id
    LIMIT 1`).get()?.resource_id || null;
}

export function getScheduledReadSettings(database, now = Date.now()) {
  const current = readStored(database);
  if (current) return current;
  const created = initialSchedule(now);
  writeStored(database, created);
  return created;
}

export function updateScheduledReadSettings(database, { enabled, interval_minutes }, now = Date.now()) {
  if (typeof enabled !== 'boolean' || !SCHEDULED_READ_INTERVALS.includes(interval_minutes)) throw new Error('invalid_scheduled_read_settings');
  const current = getScheduledReadSettings(database, now);
  const updated = {
    ...current,
    enabled,
    interval_minutes,
    next_run_at: enabled ? new Date(now + interval_minutes * 60_000).toISOString() : null,
  };
  writeStored(database, updated);
  return updated;
}

export function queueScheduledReadIfDue(database, { now = Date.now(), connected = false, id = randomUUID() } = {}) {
  let schedule = getScheduledReadSettings(database, now);
  if (!schedule.enabled) return { status: 'disabled' };
  if (!connected) return { status: 'disconnected' };
  if (!schedule.next_run_at || Date.parse(schedule.next_run_at) > now) return { status: 'not_due' };

  database.exec('BEGIN IMMEDIATE');
  try {
    schedule = getScheduledReadSettings(database, now);
    if (!schedule.enabled || !schedule.next_run_at || Date.parse(schedule.next_run_at) > now) {
      database.exec('COMMIT');
      return { status: schedule.enabled ? 'not_due' : 'disabled' };
    }
    const lease = database.prepare("SELECT lease_expires_at FROM connections WHERE id='wis-5679'").get();
    if (!lease?.lease_expires_at || !Number.isFinite(Date.parse(lease.lease_expires_at)) || Date.parse(lease.lease_expires_at) <= now) {
      database.exec('COMMIT');
      return { status: 'worker_unavailable' };
    }
    const active = database.prepare("SELECT id FROM read_commands WHERE status IN('pending','running') LIMIT 1").get();
    if (active) {
      database.exec('COMMIT');
      return { status: 'read_in_progress' };
    }
    const kind = SCHEDULED_READ_KINDS[schedule.cursor % SCHEDULED_READ_KINDS.length];
    const target = kind === 'community_subgroups' ? nextKnownCommunity(database) : null;
    if (kind === 'community_subgroups' && !target) {
      // Skip this turn so the communities read can still run and discover a
      // known target; the route naturally returns on the next rotation.
      writeStored(database, {
        ...schedule,
        cursor: (schedule.cursor + 1) % SCHEDULED_READ_KINDS.length,
        next_run_at: new Date(now + schedule.interval_minutes * 60_000).toISOString(),
      });
      database.exec('COMMIT');
      return { status: 'known_community_required' };
    }
    const createdAt = new Date(now).toISOString();
    database.prepare('INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,?,?,\'pending\',?,?)').run(id, kind, target, createdAt, createdAt);
    const updated = {
      ...schedule,
      cursor: (schedule.cursor + 1) % SCHEDULED_READ_KINDS.length,
      last_kind: kind,
      last_command_id: id,
      last_enqueued_at: createdAt,
      next_run_at: new Date(now + schedule.interval_minutes * 60_000).toISOString(),
    };
    writeStored(database, updated);
    database.exec('COMMIT');
    return { status: 'queued', id, kind, next_run_at: updated.next_run_at };
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function getScheduledReadStatus(database, now = Date.now()) {
  // Status is also used by read-only diagnostics; an absent/corrupt setting
  // must be projected in memory rather than initialized with a database write.
  const schedule = readStored(database) || initialSchedule(now);
  const command = schedule.last_command_id ? database.prepare('SELECT status FROM read_commands WHERE id=?').get(schedule.last_command_id) : null;
  const lastStatus = ['pending', 'running', 'done', 'failed'].includes(command?.status) ? command.status : null;
  const connection=database.prepare("SELECT status,phone,expected_phone_e164,lease_expires_at FROM connections WHERE id='wis-5679'").get();
  const identityVerified=Boolean(connection?.phone&&connection.expected_phone_e164&&connection.phone.replace(/\D/g,'')===connection.expected_phone_e164.replace(/\D/g,''));
  const workerLeaseCurrent=Boolean(connection?.lease_expires_at&&Number.isFinite(Date.parse(connection.lease_expires_at))&&Date.parse(connection.lease_expires_at)>now);
  const due=Boolean(schedule.enabled&&schedule.next_run_at&&Date.parse(schedule.next_run_at)<=now);
  const active=Boolean(database.prepare("SELECT 1 AS active FROM read_commands WHERE status IN('pending','running') LIMIT 1").get());
  const nextKind=SCHEDULED_READ_KINDS[schedule.cursor % SCHEDULED_READ_KINDS.length];
  const blockedReason=!schedule.enabled?'disabled':!due?'not_due':connection?.status!=='connected'||!identityVerified?'connection_required':!workerLeaseCurrent?'worker_unavailable':active?'read_in_progress':nextKind==='community_subgroups'&&!nextKnownCommunity(database)?'known_community_required':null;
  return {
    enabled: schedule.enabled,
    interval_minutes: schedule.interval_minutes,
    next_run_at: schedule.next_run_at,
    next_kind: nextKind,
    last_kind: schedule.last_kind,
    last_enqueued_at: schedule.last_enqueued_at,
    last_status: lastStatus,
    due,
    worker_lease_current: workerLeaseCurrent,
    blocked_reason: blockedReason,
  };
}
