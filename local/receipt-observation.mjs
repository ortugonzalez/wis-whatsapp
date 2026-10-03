const MIN_UNIX_SECONDS = 946684800; // 2000-01-01
const MAX_UNIX_SECONDS = 4102444800; // 2100-01-01

function timestamp(value) {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'number' || typeof value === 'string' ? String(value) : null;
  if (!raw || !/^\d{1,13}$/.test(raw)) return null;
  const seconds = Number(raw);
  return {
    raw,
    iso: Number.isSafeInteger(seconds) && seconds >= MIN_UNIX_SECONDS && seconds < MAX_UNIX_SECONDS
      ? new Date(seconds * 1000).toISOString()
      : null,
  };
}

export function projectReceiptObservation(snapshot) {
  const data = snapshot?.data;
  if (!data || typeof data !== 'object') return null;
  const receiptTimestamp = timestamp(data.receiptTimestamp);
  const readTimestamp = timestamp(data.readTimestamp);
  const playedTimestamp = timestamp(data.playedTimestamp);
  if (!receiptTimestamp && !readTimestamp && !playedTimestamp) return null;
  const persisted = typeof snapshot.updated_at === 'string' && Number.isFinite(Date.parse(snapshot.updated_at))
    ? new Date(snapshot.updated_at).toISOString()
    : null;
  return {
    source: 'baileys.message-receipt.update',
    participant: typeof data.userJid === 'string' && data.userJid.length <= 200 ? data.userJid : null,
    receipt_timestamp: receiptTimestamp,
    read_timestamp: readTimestamp,
    played_timestamp: playedTimestamp,
    persisted_at: persisted,
    history_complete: false,
  };
}
