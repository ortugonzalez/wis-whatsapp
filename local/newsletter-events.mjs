// These are passive notifications, not a complete channel history or counters.
export function normalizeNewsletterEvent(kind, value, observedAt = new Date().toISOString()) {
  if (!value || !/^\d{1,40}@newsletter$/.test(value.id || '') ||
      typeof value.server_id !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(value.server_id)) return null;
  const data = { channel_id: value.id, server_id: value.server_id, observed_at: observedAt,
    source: 'baileys_passive_event', scope: 'latest_notification_only' };
  if (kind === 'newsletter.view') {
    if (!Number.isSafeInteger(value.count) || value.count < 0) return null;
    data.reported_view_count = value.count;
  } else if (kind === 'newsletter.reaction') {
    const r = value.reaction;
    if (!r || typeof r !== 'object') return null;
    if (typeof r.code === 'string' && r.code.length <= 64 && !/[\u0000-\u001f\u007f]/.test(r.code)) data.code = r.code;
    if (Number.isSafeInteger(r.count) && r.count >= 0) data.reported_event_count = r.count;
    if (typeof r.removed === 'boolean') data.removed = r.removed;
    if (!['code', 'reported_event_count', 'removed'].some(key => Object.hasOwn(data, key))) return null;
    for (const key of ['code', 'reported_event_count', 'removed']) if (!Object.hasOwn(data, key)) data[key] = null;
    // Baileys currently synthesizes count=1 for a reaction notification.
    // Never sum this into a total: duplicates have no unique event ID.
  } else return null;
  return data;
}

export function attachNewsletterEvents(emitter, { guarded, snapshot, event }) {
  for (const kind of ['newsletter.view', 'newsletter.reaction']) {
    emitter.on(kind, guarded(value => {
      const data = normalizeNewsletterEvent(kind, value);
      if (!data) return;
      const resource = `${data.channel_id}:${data.server_id}`;
      snapshot(kind.replace('.', '_'), resource, data);
      event(kind, resource, data);
    }));
  }
}
