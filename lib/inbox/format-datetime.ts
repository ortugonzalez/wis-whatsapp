/**
 * Deterministic inbox datetime for SSR + client hydration.
 * Assembles from formatToParts and normalizes locale spaces so Node ICU
 * and the browser never disagree (e.g. NBSP in "a. m.").
 */
const TIME_ZONE = "America/Argentina/Buenos_Aires";

function collapseLocaleSpaces(value: string): string {
  return value.replace(/[\u00a0\u202f\u2007]/g, " ");
}

/** e.g. `17/9, 09:55 a. m.` — same string on server and client. */
export function formatInboxDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const byType: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    byType[part.type] = part.value;
  }

  const day = byType.day ?? "";
  const month = byType.month ?? "";
  const hour = byType.hour ?? "";
  const minute = byType.minute ?? "";
  const period = collapseLocaleSpaces(byType.dayPeriod ?? "");

  if (!day || !month || !hour || !minute) {
    return collapseLocaleSpaces(
      d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TIME_ZONE,
      }),
    );
  }

  return `${day}/${month}, ${hour}:${minute} ${period}`;
}
