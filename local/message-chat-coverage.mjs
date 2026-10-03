// Count per stored message, not per unrelated conversation. Never return values.
export function buildMessageChatCoverage(db) {
  const messageColumns = new Set(db.prepare('PRAGMA table_info(messages)').all().map(row => row.name));
  const chatColumns = new Set(db.prepare('PRAGMA table_info(conversations)').all().map(row => row.name));
  if (!messageColumns.has('conversation_id') || !['id','wa_chat_id','title'].every(field => chatColumns.has(field))) return null;
  const counts = { wa_chat_id: 0, title: 0 };
  let records = 0;
  for (const row of db.prepare('SELECT c.wa_chat_id,c.title FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id').iterate()) {
    records++;
    for (const field of Object.keys(counts)) if (typeof row[field] === 'string' && row[field].trim()) counts[field]++;
  }
  return { kind: 'message_chat', records, field_counts: Object.entries(counts).map(([field,count]) => ({field,records:count,non_empty_text_records:count})) };
}
