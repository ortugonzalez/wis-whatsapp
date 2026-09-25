/** Same priority as lib/contacts/display-name.ts (keep in sync). */
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
