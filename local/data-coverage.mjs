import { createHash } from 'node:crypto';

const SECRET_FIELD = /(token|secret|password|cookie|qr|credential|authorization|private.?key)/i;

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
  return {
    entities: {
      contacts: { known: count('SELECT count(*) AS count FROM contacts'), with_whatsapp_id: count("SELECT count(*) AS count FROM contacts WHERE wa_jid IS NOT NULL AND wa_jid!=''"), metadata_records: kindCount('contact') },
      conversations: { known: count('SELECT count(*) AS count FROM conversations'), chat_metadata_records: kindCount('chat') },
      groups: { known: count("SELECT count(*) AS count FROM conversations WHERE wa_chat_id LIKE '%@g.us'"), metadata_records: kindCount('group') },
      messages: { stored: count('SELECT count(*) AS count FROM messages'), with_whatsapp_id: count("SELECT count(*) AS count FROM messages WHERE wa_message_id IS NOT NULL AND wa_message_id!=''"), metadata_records: kindCount('message') },
    },
    message_types: db.prepare('SELECT type,count(*) AS count FROM messages GROUP BY type ORDER BY type').all().map(row => ({ type: row.type, count: row.count })),
    snapshot_kinds: snapshotKinds,
    observed_at: new Date().toISOString(),
    history_complete: false,
  };
}
