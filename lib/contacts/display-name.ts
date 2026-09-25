/**
 * UI display name priority (architecture v2 / S9):
 * agenda_name → verified_name → push_name → phone_e164 → "Sin nombre"
 */
export function computeDisplayName(input: {
  agenda_name?: string | null;
  verified_name?: string | null;
  push_name?: string | null;
  phone_e164?: string | null;
}): string {
  const pick = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  };
  return (
    pick(input.agenda_name) ||
    pick(input.verified_name) ||
    pick(input.push_name) ||
    pick(input.phone_e164) ||
    "Sin nombre"
  );
}

/** 1–2 letters for avatar fallback (Acebal inbox). */
export function contactInitials(displayName: string): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !/^\+?\d/.test(p));
  if (parts.length === 0) {
    const digits = displayName.replace(/\D/g, "");
    return (digits.slice(-2) || "?").toUpperCase();
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
