const KAPSO_META_BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";

export type KapsoSendTextResult =
  | { ok: true; wamid: string }
  | { ok: false; error: string; code?: number };

export function resolveKapsoPhoneNumberId(
  connectionPhoneNumberId: string | null | undefined,
): string | null {
  const fromConn = connectionPhoneNumberId?.trim();
  if (fromConn) return fromConn;
  const fromEnv = process.env.KAPSO_PHONE_NUMBER_ID?.trim();
  return fromEnv || null;
}

/** Free-form text via Kapso Cloud API proxy. Server-only. */
export async function sendKapsoText(opts: {
  phoneNumberId: string;
  toE164: string;
  body: string;
  bizOpaqueCallbackData?: string;
  quotedWaMessageId?: string | null;
}): Promise<KapsoSendTextResult> {
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Falta KAPSO_API_KEY en el servidor." };
  }

  const to = opts.toE164.replace(/^\+/, "");
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: opts.body },
  };
  if (opts.bizOpaqueCallbackData) {
    payload.biz_opaque_callback_data = opts.bizOpaqueCallbackData.slice(0, 512);
  }
  if (opts.quotedWaMessageId) {
    payload.context = { message_id: opts.quotedWaMessageId };
  }

  const res = await fetch(`${KAPSO_META_BASE}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string; code?: number };
  };

  if (!res.ok) {
    const msg =
      json.error?.message ??
      `Kapso send failed (${res.status})`;
    return { ok: false, error: msg, code: json.error?.code ?? res.status };
  }

  const wamid = json.messages?.[0]?.id;
  if (!wamid) {
    return { ok: false, error: "Kapso no devolvió wamid." };
  }
  return { ok: true, wamid };
}
