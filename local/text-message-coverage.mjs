// Only aggregate counts leave this function; captions and UI fallback labels
// are stored in body too, but are not evidence of WHAPI text.body.
export function buildTextMessageCoverage(db) {
  const columns = new Set(db.prepare('PRAGMA table_info(messages)').all().map(row => row.name));
  if (!columns.has('type') || !columns.has('body')) return null;
  let records = 0, textRecords = 0;
  for (const row of db.prepare("SELECT body FROM messages WHERE type='text'").iterate()) {
    records++;
    if (typeof row.body === 'string' && row.body.trim().length) textRecords++;
  }
  return { kind: 'stored_text_message', records, field_counts: [{ field: 'body', records: textRecords, non_empty_text_records: textRecords }] };
}
