const KAPSO_META_BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";

export type KapsoMarkReadResult =
  | { ok: true }
  | { ok: false; error: string; code?: number };

/**
 * Mark inbound message(s) read via Kapso Meta proxy.
 * Docs: https://docs.kapso.ai/docs/whatsapp/send-messages/mark-read
 * Truth for Kapso native inbox unread: inbound kapso.status → "read".
 */
export async function markKapsoMessageRead(opts: {
  phoneNumberId: string;
  messageId: string;
}): Promise<KapsoMarkReadResult> {
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Falta KAPSO_API_KEY en el servidor." };
  }

  const messageId = opts.messageId.trim();
  if (!messageId) {
    return { ok: false, error: "Falta message_id (wamid)." };
  }

  const res = await fetch(
    `${KAPSO_META_BASE}/${opts.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    },
  );

  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number };
    };
    return {
      ok: false,
      error: json.error?.message ?? `Kapso markRead failed (${res.status})`,
      code: json.error?.code ?? res.status,
    };
  }

  return { ok: true };
}

/** Build Meta mark-read body (pure; used by selfcheck). */
export function kapsoMarkReadBody(messageId: string): Record<string, string> {
  return {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  };
}
