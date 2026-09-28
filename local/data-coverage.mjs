import { createHash } from 'node:crypto';

const SECRET_FIELD = /(token|secret|password|cookie|qr|credential|authorization|private.?key)/i;
const SAFE_READ_ERROR_CODES = ['read_timeout','read_pending','disconnected','method_missing','identity_unavailable','invalid_target','unknown_target','not_found','order_message_unavailable','order_credential_unavailable','public_catalog_unavailable','graphql_error','access_denied','rate_limited','transport_failed','public_catalog_config_unavailable','provider_error','read_failed','worker_interrupted','read_unavailable_or_disconnected','invalid_response','avatar_unavailable','avatar_destination_rejected','avatar_download_failed','avatar_timeout','avatar_too_large','invalid_avatar_media'];

function normalizeArrayIndexes(path) {
  let result = '', quoted = false, escaped = false;
  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; result += char; continue; }
    if (char === '[') {
      const end = path.indexOf(']', i + 1), index = end < 0 ? '' : path.slice(i + 1, end);
      if (/^\d+$/.test(index)) { result += '[]'; i = end; continue; }
    }
    result += char;
  }
  return result;
}

export function buildDataCoverage(db) {
  const count = (sql) => db.prepare(sql).get().count;
  const byKind = new Map(db.prepare('SELECT kind,count(*) AS records,max(updated_at) AS last_updated_at FROM snapshots GROUP BY kind ORDER BY kind').all().map(row => [row.kind, { kind: row.kind, records: row.records, last_updated_at: row.last_updated_at, fields: new Map(), omittedFieldNames: new Set(), fieldInventoryTruncated: false }]));
  const fieldStatement = db.prepare("SELECT s.kind,s.resource_id,s.updated_at,j.fullkey AS field,j.key AS key_type FROM snapshots s JOIN json_tree(CASE WHEN json_valid(s.payload) THEN s.payload ELSE '{}' END) j WHERE json_type(CASE WHEN json_valid(s.payload) THEN s.payload ELSE '{}' END)='object' AND j.key IS NOT NULL ORDER BY s.kind,s.resource_id");
  let activeKind = null, activeResource = null, activeSnapshotUpdatedAt = null, activeFields = new Set();
  const flushFields = () => {
    const entry = byKind.get(activeKind);
    if (!entry) return;
    for (const field of activeFields) {
      if (!entry.fields.has(field) && entry.fields.size >= 10000) { entry.fieldInventoryTruncated = true; continue; }
      const prior = entry.fields.get(field) || { records: 0, snapshot_updated_at: null };
      prior.records++;
      if (activeSnapshotUpdatedAt && (!prior.snapshot_updated_at || activeSnapshotUpdatedAt > prior.snapshot_updated_at)) prior.snapshot_updated_at = activeSnapshotUpdatedAt;
      entry.fields.set(field, prior);
    }
    activeFields = new Set();
  };
  for (const row of fieldStatement.iterate()) {
    if (row.kind !== activeKind || row.resource_id !== activeResource) {
      flushFields(); activeKind = row.kind; activeResource = row.resource_id;
      const parsedAt = typeof row.updated_at === 'string' ? Date.parse(row.updated_at) : NaN;
      activeSnapshotUpdatedAt = Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : null;
    }
    const entry = byKind.get(row.kind);
    if (!entry || typeof row.key_type !== 'string' || typeof row.field !== 'string') continue;
    const field = normalizeArrayIndexes(row.field);
    if (SECRET_FIELD.test(field)) continue;
    if (field.length > 100) { if (entry.omittedFieldNames.size < 1000) entry.omittedFieldNames.add(createHash('sha256').update(field).digest('hex')); else entry.fieldInventoryTruncated = true; continue; }
    if (activeFields.has(field)) continue;
    if (activeFields.size < 10000) activeFields.add(field);
    else entry.fieldInventoryTruncated = true;
  }
  flushFields();
  const snapshotKinds = [...byKind.values()].map(item => {
    const visibleFields = [...item.fields].filter(([field]) => field.length <= 100).sort(([a], [b]) => a.localeCompare(b));
    return {
      kind: item.kind,
      records: item.records,
      last_updated_at: item.last_updated_at,
      fields: visibleFields.slice(0, 100).map(([field]) => field),
      field_counts: visibleFields.slice(0, 100).map(([field, value]) => ({ field, records: value.records, snapshot_updated_at: value.snapshot_updated_at })),
      omitted_fields: item.omittedFieldNames.size + Math.max(0, visibleFields.length - 100),
      field_inventory_truncated: item.fieldInventoryTruncated,
    };
  });
  const kindCount = kind => byKind.get(kind)?.records || 0;
  const errorPlaceholders = SAFE_READ_ERROR_CODES.map(() => '?').join(',');
  const readErrorRows = db.prepare(`SELECT kind,CASE WHEN error IN (${errorPlaceholders}) THEN error ELSE 'read_failed' END AS code,count(*) AS count,max(updated_at) AS last_updated_at FROM read_commands WHERE status='failed' GROUP BY kind,code ORDER BY kind,code LIMIT 101`).all(...SAFE_READ_ERROR_CODES);
  const readErrors = readErrorRows.slice(0,100).map(row => ({ kind: row.kind, code: row.code, count: row.count, last_updated_at: typeof row.last_updated_at === 'string' && Number.isFinite(Date.parse(row.last_updated_at)) ? new Date(row.last_updated_at).toISOString() : null }));
  const rawMessageSources = db.prepare("SELECT source,direction,count(*) AS count,MAX(CASE WHEN datetime(created_at) IS NOT NULL THEN created_at END) AS latest_at FROM messages GROUP BY source,direction").all();
  const messageSources = new Map();
  for (const row of rawMessageSources) {
    const origin = row.source === 'live' ? 'live' : row.source === 'import' ? 'import' : 'other';
    const direction = row.direction === 'in' ? 'inbound' : row.direction === 'out' ? 'outbound' : 'other';
    const source = origin === 'other' || direction === 'other' ? 'other' : `${origin}_${direction}`;
    const prior = messageSources.get(source) || { source, count: 0, latest_at: null };
    prior.count += row.count;
    if (typeof row.latest_at === 'string' && Number.isFinite(Date.parse(row.latest_at)) && (!prior.latest_at || row.latest_at > prior.latest_at)) prior.latest_at = new Date(row.latest_at).toISOString();
    messageSources.set(source, prior);
  }
  return {
    entities: {
      contacts: { known: count('SELECT count(*) AS count FROM contacts'), with_whatsapp_id: count("SELECT count(*) AS count FROM contacts WHERE wa_jid IS NOT NULL AND wa_jid!=''"), metadata_records: kindCount('contact') },
      conversations: { known: count('SELECT count(*) AS count FROM conversations'), chat_metadata_records: kindCount('chat') },
      groups: { known: count("SELECT count(*) AS count FROM conversations WHERE wa_chat_id LIKE '%@g.us'"), metadata_records: kindCount('group') },
      identity_observations: { known: kindCount('identity'), with_whatsapp_id: count("SELECT count(*) AS count FROM snapshots WHERE kind='identity' AND json_type(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.pn')='text' AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.pn')!=''"), metadata_records: kindCount('identity') },
      messages: { stored: count('SELECT count(*) AS count FROM messages'), with_whatsapp_id: count("SELECT count(*) AS count FROM messages WHERE wa_message_id IS NOT NULL AND wa_message_id!=''"), metadata_records: kindCount('message') },
    },
    message_types: db.prepare('SELECT type,count(*) AS count FROM messages GROUP BY type ORDER BY type').all().map(row => ({ type: row.type, count: row.count })),
    message_sources: ['live_inbound','live_outbound','import_inbound','import_outbound','other'].filter(source => messageSources.has(source)).map(source => messageSources.get(source)),
    live_inbound_count: messageSources.get('live_inbound')?.count ?? 0,
    last_live_message_at: messageSources.get('live_inbound')?.latest_at ?? null,
    snapshot_kinds: snapshotKinds,
    read_commands: db.prepare('SELECT kind,status,count(*) AS count,max(updated_at) AS last_updated_at FROM read_commands GROUP BY kind,status ORDER BY kind,status').all().map(row => ({ kind: row.kind, status: row.status, count: row.count, last_updated_at: typeof row.last_updated_at === 'string' && Number.isFinite(Date.parse(row.last_updated_at)) ? new Date(row.last_updated_at).toISOString() : null })),
    read_errors: readErrors,
    read_errors_truncated: readErrorRows.length > 100,
    observed_at: new Date().toISOString(),
    history_complete: false,
  };
}
