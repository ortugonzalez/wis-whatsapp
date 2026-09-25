/** Kapso CRM outbound attribution (ADR 008). */

export type OutboundOrigin = "crm" | "cobranzas" | "system";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Parse `crm:{message_uuid}` from Meta biz_opaque_callback_data. */
export function parseCrmOpaqueMessageId(
  opaque: string | null | undefined,
): string | null {
  if (!opaque) return null;
  const trimmed = opaque.trim();
  if (!trimmed.toLowerCase().startsWith("crm:")) return null;
  const id = trimmed.slice(4).trim();
  return UUID_RE.test(id) ? id : null;
}

/**
 * Heuristic when mirroring an outbound webhook without a CRM `sent_by` row:
 * - `crm:…` → crm (usually already persisted; race path)
 * - bare UUID → cobranzas campana_envio_id
 * - else → system (GAS / other Cloud API clients)
 */
export function resolveOutboundOrigin(
  opaque: string | null | undefined,
): OutboundOrigin {
  const trimmed = opaque?.trim() ?? "";
  if (!trimmed) return "system";
  if (parseCrmOpaqueMessageId(trimmed)) return "crm";
  if (UUID_RE.test(trimmed)) return "cobranzas";
  return "system";
}

export function outboundOriginAuthorLabel(
  origin: OutboundOrigin | null | undefined,
): string {
  switch (origin) {
    case "cobranzas":
      return "Cobranzas";
    case "system":
      return "Sistema";
    case "crm":
      return "CRM";
    default:
      return "Teléfono";
  }
}

/** Pull biz_opaque from Kapso/Meta webhook shapes we have seen. */
export function extractBizOpaque(payload: {
  message?: {
    biz_opaque_callback_data?: string | null;
    kapso?: {
      biz_opaque_callback_data?: string | null;
      statuses?: Array<{
        biz_opaque_callback_data?: string | null;
        // Raw Meta status objects sometimes nest under different keys.
        bizOpaqueCallbackData?: string | null;
      }>;
    };
  };
}): string | null {
  const msg = payload.message;
  if (!msg) return null;
  const direct =
    msg.biz_opaque_callback_data?.trim() ||
    msg.kapso?.biz_opaque_callback_data?.trim();
  if (direct) return direct;
  const statuses = msg.kapso?.statuses;
  if (!Array.isArray(statuses)) return null;
  for (const s of statuses) {
    const v =
      s?.biz_opaque_callback_data?.trim() ||
      s?.bizOpaqueCallbackData?.trim();
    if (v) return v;
  }
  return null;
}

/** Prefer exact body match among pending CRM outbound candidates. */
export function pickPendingCrmOutbound(
  candidates: Array<{
    id: string;
    body: string | null;
    sent_by: string | null;
    outbound_origin: string | null;
  }>,
  body: string | null,
): { id: string } | null {
  const crmRows = candidates.filter(
    (r) =>
      r.outbound_origin === "crm" ||
      (r.sent_by != null && r.sent_by !== ""),
  );
  if (!crmRows.length) return null;
  const bodyNorm = (body ?? "").trim();
  const match =
    (bodyNorm
      ? crmRows.find((r) => (r.body ?? "").trim() === bodyNorm)
      : undefined) ?? crmRows[0];
  return { id: match.id };
}
