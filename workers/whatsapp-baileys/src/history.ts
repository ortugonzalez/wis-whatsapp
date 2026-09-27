/** Baileys protobuf timestamps are UNIX seconds (number, string or Long). */
export function messageTimestampIso(value: unknown): string | null {
  let seconds: number;
  try {
    seconds = Number(typeof value === "object" && value !== null && "toNumber" in value
      ? (value as { toNumber(): number }).toNumber() : value);
  } catch { return null; }
  // Missing or malformed historical dates must not turn into "now"/unread.
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > Date.now() / 1000 + 300) return null;
  return new Date(Math.floor(seconds) * 1000).toISOString();
}
