const SECRET_FIELD = /(token|secret|password|cookie|qr|credential|authorization|private.?key)/i;

export function buildDataCoverage(db) {
  const count = (sql) => db.prepare(sql).get().count;
  const byKind = new Map(db.prepare('SELECT kind,count(*) AS records,max(updated_at) AS last_updated_at FROM snapshots GROUP BY kind ORDER BY kind').all().map(row => [row.kind, { kind: row.kind, records: row.records, last_updated_at: row.last_updated_at, fields: new Map() }]));
  const fields = db.prepare("SELECT s.kind,j.key AS field,count(DISTINCT s.resource_id) AS records FROM snapshots s JOIN json_each(CASE WHEN json_valid(s.payload) THEN s.payload ELSE '{}' END) j WHERE json_type(CASE WHEN json_valid(s.payload) THEN s.payload ELSE '{}' END)='object' GROUP BY s.kind,j.key ORDER BY s.kind,j.key").all();
  for (const row of fields) {
    const entry = byKind.get(row.kind);
    if (entry && typeof row.field === 'string' && !SECRET_FIELD.test(row.field)) entry.fields.set(row.field, row.records);
  }
  const snapshotKinds = [...byKind.values()].map(item => {
    const visibleFields = [...item.fields].filter(([field]) => field.length <= 100).sort(([a], [b]) => a.localeCompare(b));
    return {
      kind: item.kind,
      records: item.records,
      last_updated_at: item.last_updated_at,
      fields: visibleFields.slice(0, 100).map(([field]) => field),
      field_counts: visibleFields.slice(0, 100).map(([field, records]) => ({ field, records })),
      omitted_fields: item.fields.size - Math.min(visibleFields.length, 100),
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
