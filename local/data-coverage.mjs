import { createHash } from 'node:crypto';
import { projectAccountLimits } from './account-limits-projection.mjs';
import { classifyWhatsAppChatType } from './wa-chat-type.mjs';

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
  // Presence maps use WhatsApp identities as object keys; expose only the
  // map shape in aggregate field inventories, never the dynamic identity.
  return result.replace(/(\$\.presences)\."(?:[^"\\]|\\.)*"/g, '$1.*');
}

export function buildDataCoverage(db, now = Date.now()) {
  const count = (sql) => db.prepare(sql).get().count;
  const byKind = new Map(db.prepare('SELECT kind,count(*) AS records,max(updated_at) AS last_updated_at FROM snapshots GROUP BY kind ORDER BY kind').all().map(row => [row.kind, { kind: row.kind, records: row.records, last_updated_at: row.last_updated_at, fields: new Map(), omittedFieldNames: new Set(), fieldInventoryTruncated: false }]));
  const fieldStatement = db.prepare("SELECT s.kind,s.resource_id,s.updated_at,json_extract(CASE WHEN json_valid(s.payload) THEN s.payload ELSE '{}' END,'$.expires_at') AS expires_at,j.fullkey AS field,j.key AS key_type,j.type AS value_type,CASE WHEN j.type='text' THEN length(j.value) ELSE NULL END AS text_length FROM snapshots s JOIN json_tree(CASE WHEN json_valid(s.payload) THEN s.payload ELSE '{}' END) j WHERE json_type(CASE WHEN json_valid(s.payload) THEN s.payload ELSE '{}' END)='object' AND j.key IS NOT NULL ORDER BY s.kind,s.resource_id");
  let activeKind = null, activeResource = null, activeSnapshotUpdatedAt = null, activeFields = new Map();
  const flushFields = () => {
    const entry = byKind.get(activeKind);
    if (!entry) return;
    for (const [field, nonEmptyText] of activeFields) {
      if (!entry.fields.has(field) && entry.fields.size >= 10000) { entry.fieldInventoryTruncated = true; continue; }
      const prior = entry.fields.get(field) || { records: 0, non_empty_text_records: 0, snapshot_updated_at: null };
      prior.records++;
      if (nonEmptyText) prior.non_empty_text_records++;
      if (activeSnapshotUpdatedAt && (!prior.snapshot_updated_at || activeSnapshotUpdatedAt > prior.snapshot_updated_at)) prior.snapshot_updated_at = activeSnapshotUpdatedAt;
      entry.fields.set(field, prior);
    }
    activeFields = new Map();
  };
  for (const row of fieldStatement.iterate()) {
    if (row.kind !== activeKind || row.resource_id !== activeResource) {
      flushFields(); activeKind = row.kind; activeResource = row.resource_id;
      const parsedAt = typeof row.updated_at === 'string' ? Date.parse(row.updated_at) : NaN;
      activeSnapshotUpdatedAt = Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : null;
    }
    const entry = byKind.get(row.kind);
    const scalarArrayItem = Number.isInteger(row.key_type) && typeof row.field === 'string' && /\[\d+\]$/.test(row.field) && ['text','integer','real','true','false','null'].includes(row.value_type);
    if (!entry || (typeof row.key_type !== 'string' && !scalarArrayItem) || typeof row.field !== 'string') continue;
    const field = normalizeArrayIndexes(row.field);
    if (SECRET_FIELD.test(field)) continue;
    if (['group_invite','community_invite'].includes(row.kind) && field === '$.code') {
      const expiresAt = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : NaN;
      if (!Number.isFinite(expiresAt) || expiresAt <= now) continue;
    }
    if (field.length > 100) { if (entry.omittedFieldNames.size < 1000) entry.omittedFieldNames.add(createHash('sha256').update(field).digest('hex')); else entry.fieldInventoryTruncated = true; continue; }
    const nonEmptyText = row.value_type === 'text' && Number(row.text_length) > 0;
    if (activeFields.has(field)) { if (nonEmptyText) activeFields.set(field, true); continue; }
    if (activeFields.size < 10000) activeFields.set(field, nonEmptyText);
    else entry.fieldInventoryTruncated = true;
  }
  flushFields();
  const chatKind = byKind.get('chat');
  if (chatKind) {
    let recognizedChatTypes = 0;
    for (const row of db.prepare("SELECT resource_id FROM snapshots WHERE kind='chat'").iterate()) {
      if (classifyWhatsAppChatType(row.resource_id)) recognizedChatTypes++;
    }
    if (recognizedChatTypes > 0) chatKind.fields.set('$.whapi_derived.chat_type_from_jid', {
      records: recognizedChatTypes,
      non_empty_text_records: recognizedChatTypes,
      snapshot_updated_at: null,
    });
  }
  const accountLimitsKind = byKind.get('account_limits');
  if (accountLimitsKind) {
    for (const row of db.prepare("SELECT payload,updated_at FROM snapshots WHERE kind='account_limits'").all()) {
      let raw = {};
      try { raw = JSON.parse(row.payload) || {}; } catch { /* malformed snapshots add no derived evidence */ }
      const projection = projectAccountLimits(raw);
      for (const [method, result] of Object.entries(projection)) {
        for (const [name, value] of Object.entries(result.fields)) {
          if (value === null) continue;
          const field = `$.whapi_projection.${method}.fields.${name}`;
          const prior = accountLimitsKind.fields.get(field) || { records: 0, non_empty_text_records: 0, snapshot_updated_at: null };
          prior.records++;
          if (typeof value === 'string' && value.length > 0) prior.non_empty_text_records++;
          if (typeof row.updated_at === 'string' && (!prior.snapshot_updated_at || row.updated_at > prior.snapshot_updated_at)) prior.snapshot_updated_at = row.updated_at;
          accountLimitsKind.fields.set(field, prior);
        }
      }
    }
  }
  const snapshotKinds = [...byKind.values()].map(item => {
    const visibleFields = [...item.fields].filter(([field]) => field.length <= 100).sort(([a], [b]) => a.localeCompare(b));
    return {
      kind: item.kind,
      records: item.records,
      last_updated_at: item.last_updated_at,
      fields: visibleFields.slice(0, 100).map(([field]) => field),
      field_counts: visibleFields.slice(0, 100).map(([field, value]) => ({ field, records: value.records, non_empty_text_records: value.non_empty_text_records, snapshot_updated_at: value.snapshot_updated_at })),
      omitted_fields: item.omittedFieldNames.size + Math.max(0, visibleFields.length - 100),
      field_inventory_truncated: item.fieldInventoryTruncated,
    };
  });
  const storageKinds = [];
  for (const table of ['contacts', 'conversations', 'messages']) {
    const columns = db.prepare('PRAGMA table_info("' + table + '")').all().map(row => row.name).filter(name => typeof name === 'string' && !SECRET_FIELD.test(name));
    if (!columns.length) continue;
    const metricsSql = 'SELECT count(*) AS total_records,' + columns.map((name, index) => 'count("' + name.replaceAll('"', '""') + '") AS f' + index).join(',') + ' FROM "' + table + '"';
    const metrics = db.prepare(metricsSql).get();
    storageKinds.push({
      kind: table,
      records: metrics.total_records,
      field_counts: columns.map((field, index) => ({ field, records: metrics['f' + index] })),
    });
  }
  const contextualKinds = [];
  const chatLabelAssociations = db.prepare("SELECT count(*) AS records,max(updated_at) AS updated_at FROM snapshots WHERE kind='label_association' AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.type')='label_jid' AND json_extract(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.associated')=1 AND json_type(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.chatId')='text' AND json_type(CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,'$.labelId')='text'").get();
  if (chatLabelAssociations.records > 0) contextualKinds.push({
    kind: 'label_chat_association',
    records: chatLabelAssociations.records,
    field_counts: ['chatId', 'labelId'].map(field => ({ field, records: chatLabelAssociations.records, snapshot_updated_at: chatLabelAssociations.updated_at })),
  });
  const latestMessageColumns = ['wa_message_id', 'type', 'created_at', 'delivery_status', 'direction', 'body'];
  const messageColumns = new Set(db.prepare('PRAGMA table_info("messages")').all().map(row => row.name));
  const conversationColumns = new Set(db.prepare('PRAGMA table_info("conversations")').all().map(row => row.name));
  const canJoinLatestMessages = ['id','conversation_id',...latestMessageColumns].every(field => messageColumns.has(field)) && ['id','wa_chat_id','title'].every(field => conversationColumns.has(field));
  for (const scope of (canJoinLatestMessages ? [
    { kind: 'chat_last_message', where: '1=1' },
    { kind: 'group_last_message', where: "c.wa_chat_id LIKE '%@g.us'" },
  ] : [])) {
    const latestJoin = "LEFT JOIN messages m ON m.id=(SELECT m2.id FROM messages m2 WHERE m2.conversation_id=c.id ORDER BY CASE WHEN datetime(m2.created_at) IS NOT NULL THEN m2.created_at END DESC,m2.id DESC LIMIT 1)";
    const total = db.prepare('SELECT count(*) AS total FROM conversations c WHERE ' + scope.where).get().total;
    const expressions = latestMessageColumns.map((field, index) => 'count(m."' + field + '") AS f' + index);
    expressions.push('count(CASE WHEN m.id IS NOT NULL THEN c.wa_chat_id END) AS chat_id_count');
    expressions.push('count(CASE WHEN m.id IS NOT NULL AND c.title IS NOT NULL THEN c.title END) AS chat_name_count');
    const metrics = db.prepare('SELECT ' + expressions.join(',') + ' FROM conversations c ' + latestJoin + ' WHERE ' + scope.where).get();
    contextualKinds.push({
      kind: scope.kind,
      records: total,
      field_counts: [
        ...latestMessageColumns.map((field, index) => ({ field, records: metrics['f' + index] })),
        { field: 'wa_chat_id', records: metrics.chat_id_count },
        { field: 'title', records: metrics.chat_name_count },
      ],
    });
  }
  const kindCount = kind => byKind.get(kind)?.records || 0;
  const errorPlaceholders = SAFE_READ_ERROR_CODES.map(() => '?').join(',');
  const readErrorRows = db.prepare(`SELECT kind,CASE WHEN error IN (${errorPlaceholders}) THEN error ELSE 'read_failed' END AS code,count(*) AS count,max(updated_at) AS last_updated_at FROM read_commands WHERE status='failed' GROUP BY kind,code ORDER BY kind,code LIMIT 101`).all(...SAFE_READ_ERROR_CODES);
  const latestReadByKind = new Map();
  for (const row of db.prepare('SELECT kind,status,updated_at FROM read_commands ORDER BY updated_at DESC,id DESC').iterate()) {
    if (!latestReadByKind.has(row.kind)) latestReadByKind.set(row.kind, row);
  }
  const readErrors = readErrorRows.slice(0,100).map(row => {
    const latest = latestReadByKind.get(row.kind);
    const latestStatusAt = typeof latest?.updated_at === 'string' && Number.isFinite(Date.parse(latest.updated_at)) ? new Date(latest.updated_at).toISOString() : null;
    const latestStatus = ['pending','running','done','failed'].includes(latest?.status) ? latest.status : null;
    return {
      kind: row.kind,
      code: row.code,
      count: row.count,
      last_updated_at: typeof row.last_updated_at === 'string' && Number.isFinite(Date.parse(row.last_updated_at)) ? new Date(row.last_updated_at).toISOString() : null,
      latest_status: latestStatus,
      latest_status_at: latestStatusAt,
    };
  });
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
    storage_kinds: storageKinds,
    contextual_kinds: contextualKinds,
    read_commands: db.prepare('SELECT kind,status,count(*) AS count,max(updated_at) AS last_updated_at FROM read_commands GROUP BY kind,status ORDER BY kind,status').all().map(row => ({ kind: row.kind, status: row.status, count: row.count, last_updated_at: typeof row.last_updated_at === 'string' && Number.isFinite(Date.parse(row.last_updated_at)) ? new Date(row.last_updated_at).toISOString() : null })),
    read_errors: readErrors,
    read_errors_truncated: readErrorRows.length > 100,
    observed_at: new Date().toISOString(),
    history_complete: false,
  };
}
