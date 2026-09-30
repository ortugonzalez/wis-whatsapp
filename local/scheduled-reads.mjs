import { randomUUID } from 'node:crypto';

export const SCHEDULED_READ_KINDS = Object.freeze(['all', 'blocklist', 'communities', 'catalog', 'collections', 'newsletters', 'account_limits', 'account_username', 'contact_profiles', 'group_requests', 'avatars', 'bot_list', 'disappearing_mode', 'community_subgroups']);
export const SCHEDULED_READ_INTERVALS = Object.freeze([15, 30, 60, 120]);
const SETTING_KEY = 'scheduled_reads';
const RECENT_TIMEOUT_COOLDOWN_MS = 6 * 60 * 60_000;

function initialSchedule(now) {
  return {
    enabled: true,
    interval_minutes: 15,
    cursor: 0,
    next_run_at: new Date(now + 15 * 60_000).toISOString(),
    last_kind: null,
    last_command_id: null,
    last_enqueued_at: null,
    last_skipped_kinds: [],
    last_skip_reason: null,
    last_skip_at: null,
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

function isRecentlyTimedOut(database, kind, now) {
  const command = database.prepare("SELECT status,error,updated_at FROM read_commands WHERE kind=? ORDER BY created_at DESC,id DESC LIMIT 1").get(kind);
  const failedAt = Date.parse(command?.updated_at || '');
  return command?.status === 'failed' && command.error === 'read_timeout' && Number.isFinite(failedAt) && failedAt <= now && now - failedAt < RECENT_TIMEOUT_COOLDOWN_MS;
}

function findNextRoute(database, startCursor, now) {
  const skipped = [];
  let cursor = startCursor;
  for (let checked = 0; checked < SCHEDULED_READ_KINDS.length; checked += 1) {
    const kind = SCHEDULED_READ_KINDS[cursor];
    if (isRecentlyTimedOut(database, kind, now)) {
      skipped.push(kind);
      cursor = (cursor + 1) % SCHEDULED_READ_KINDS.length;
      continue;
    }
    return { kind, target: kind === 'community_subgroups' ? nextKnownCommunity(database) : null, cursor: (cursor + 1) % SCHEDULED_READ_KINDS.length, skipped };
  }
  return { kind: null, target: null, cursor, skipped };
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
    const route = findNextRoute(database, schedule.cursor, now);
    const kind = route.kind;
    const target = route.target;
    if (!kind) {
      writeStored(database, {
        ...schedule,
        cursor: route.cursor,
        next_run_at: new Date(now + schedule.interval_minutes * 60_000).toISOString(),
        last_skipped_kinds: route.skipped,
        last_skip_reason: 'recent_read_timeout',
        last_skip_at: new Date(now).toISOString(),
      });
      database.exec('COMMIT');
      return { status: 'all_routes_cooling_down', next_run_at: new Date(now + schedule.interval_minutes * 60_000).toISOString() };
    }
    if (kind === 'community_subgroups' && !target) {
      // Skip this turn so the communities read can still run and discover a
      // known target; the route naturally returns on the next rotation.
      writeStored(database, {
        ...schedule,
        cursor: route.cursor,
        next_run_at: new Date(now + schedule.interval_minutes * 60_000).toISOString(),
        last_skipped_kinds: [...route.skipped, kind],
        last_skip_reason: route.skipped.length ? 'recent_read_timeout_and_known_community_required' : 'known_community_required',
        last_skip_at: new Date(now).toISOString(),
      });
      database.exec('COMMIT');
      return { status: 'known_community_required' };
    }
    const createdAt = new Date(now).toISOString();
    database.prepare('INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,?,?,\'pending\',?,?)').run(id, kind, target, createdAt, createdAt);
    const updated = {
      ...schedule,
      cursor: route.cursor,
      last_kind: kind,
      last_command_id: id,
      last_enqueued_at: createdAt,
      next_run_at: new Date(now + schedule.interval_minutes * 60_000).toISOString(),
      last_skipped_kinds: route.skipped,
      last_skip_reason: route.skipped.length ? 'recent_read_timeout' : null,
      last_skip_at: route.skipped.length ? createdAt : null,
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
  const nextRoute=findNextRoute(database,schedule.cursor,now);
  const nextKind=nextRoute.kind;
  const blockedReason=!schedule.enabled?'disabled':!due?'not_due':connection?.status!=='connected'||!identityVerified?'connection_required':!workerLeaseCurrent?'worker_unavailable':active?'read_in_progress':!nextKind?'all_routes_cooling_down':nextKind==='community_subgroups'&&!nextRoute.target?'known_community_required':null;
  return {
    enabled: schedule.enabled,
    interval_minutes: schedule.interval_minutes,
    next_run_at: schedule.next_run_at,
    next_kind: nextKind,
    last_kind: schedule.last_kind,
    last_enqueued_at: schedule.last_enqueued_at,
    last_status: lastStatus,
    last_skipped_kinds: Array.isArray(schedule.last_skipped_kinds) ? schedule.last_skipped_kinds.filter(kind => SCHEDULED_READ_KINDS.includes(kind)) : [],
    last_skip_reason: typeof schedule.last_skip_reason === 'string' ? schedule.last_skip_reason : null,
    last_skip_at: typeof schedule.last_skip_at === 'string' ? schedule.last_skip_at : null,
    due,
    worker_lease_current: workerLeaseCurrent,
    blocked_reason: blockedReason,
  };
}
