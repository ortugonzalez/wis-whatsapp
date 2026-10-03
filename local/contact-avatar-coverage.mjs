// Aggregate only: callers supply the existing private-file metadata validator.
// No remote reads, content bytes, identifiers or filenames leave this function.
export function summarizeContactAvatars(db, { hasCachedFile, limit = 1000 } = {}) {
  if (typeof hasCachedFile !== 'function') throw new TypeError('avatar_validator_required');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('invalid_avatar_scan_limit');
  // Match the API's bare numeric PN/LID targets before counting or limiting.
  const numericTarget = suffix => `(wa_jid GLOB '*${suffix}' AND length(wa_jid)>length('${suffix}') AND substr(wa_jid,1,length(wa_jid)-length('${suffix}')) NOT GLOB '*[^0-9]*')`;
  const known = `SELECT DISTINCT wa_jid FROM contacts WHERE length(wa_jid)<=150 AND (${numericTarget('@s.whatsapp.net')} OR ${numericTarget('@lid')})`;
  const total = db.prepare(`SELECT count(*) AS n FROM (${known})`).get().n;
  const result = {
    scope: 'known_contact_targets', total_targets: total, inspected_targets: 0,
    scan_limit: limit, partial: total > limit,
    not_collected: 0, invalid_snapshot: 0, validation_errors: 0,
    cached_current: 0, cached_stale: 0, cached_unavailable: 0,
    no_cached_file: 0, latest_sampled_snapshot_at: null,
    file_check: 'private_path_existence_size_declared_mime',
    content_signature_verified: false, freshness_confirmed: false,
  };
  const rows = db.prepare(`SELECT a.payload, a.updated_at FROM (${known}) c LEFT JOIN snapshots a ON a.kind='avatar' AND a.resource_id=c.wa_jid ORDER BY c.wa_jid LIMIT ?`);
  for (const row of rows.iterate(limit)) {
    result.inspected_targets++;
    if (row.payload === null) { result.not_collected++; continue; }
    if (typeof row.updated_at === 'string' && Number.isFinite(Date.parse(row.updated_at))) {
      const date = new Date(row.updated_at).toISOString();
      if (!result.latest_sampled_snapshot_at || date > result.latest_sampled_snapshot_at) result.latest_sampled_snapshot_at = date;
    }
    let data;
    try { data = JSON.parse(row.payload); } catch { result.invalid_snapshot++; continue; }
    if (!data || Array.isArray(data) || typeof data !== 'object') { result.invalid_snapshot++; continue; }
    let cached;
    try { cached = hasCachedFile(data) === true; } catch { result.validation_errors++; continue; }
    if (!cached) result.no_cached_file++;
    else if (data.stale === true) result.cached_stale++;
    else if (data.available === true && data.stale === false) result.cached_current++;
    else result.cached_unavailable++;
  }
  return result;
}
