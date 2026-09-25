type DirectDedupeRow = {
  /** Optional for list rows that predate group support; undefined counts as direct. */
  kind?: "direct" | "group";
  phone_e164: string | null;
};

/** Hide duplicate direct rows for the same E.164 (PN vs LID split). List must be pre-sorted by recency. */
export function dedupeDirectConversationsByPhone<T extends DirectDedupeRow>(
  rows: T[],
): T[] {
  const seenPhones = new Set<string>();
  return rows.filter((row) => {
    if (row.kind === "group" || !row.phone_e164) return true;
    if (seenPhones.has(row.phone_e164)) return false;
    seenPhones.add(row.phone_e164);
    return true;
  });
}
