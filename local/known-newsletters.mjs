export const NEWSLETTER_READ_BATCH_SIZE = 20;

/**
 * Select locally known channels fairly for bounded Baileys metadata reads.
 * This is not a remote newsletter directory: Baileys exposes metadata lookup
 * only for known IDs. Missing or oldest snapshots are refreshed first.
 */
export function selectKnownNewsletterTargets(database, limit = NEWSLETTER_READ_BATCH_SIZE) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid_newsletter_batch_size');
  const rows = database.prepare(`WITH known(id) AS (
      SELECT wa_chat_id FROM conversations WHERE wa_chat_id LIKE '%@newsletter'
      UNION
      SELECT resource_id FROM snapshots WHERE kind='newsletter'
    )
    SELECT known.id
    FROM known
    LEFT JOIN snapshots AS observed ON observed.kind='newsletter' AND observed.resource_id=known.id
    ORDER BY CASE WHEN observed.updated_at IS NULL THEN 0 ELSE 1 END, observed.updated_at, known.id`).iterate();
  const targets = [];
  let truncated = false;
  for (const row of rows) {
    if (typeof row.id !== 'string' || !/^\d{1,40}@newsletter$/.test(row.id)) continue;
    if (targets.length === limit) { truncated = true; break; }
    targets.push(row.id);
  }
  return { targets, truncated };
}
