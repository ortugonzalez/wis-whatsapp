const KAPSO_PLATFORM = "https://api.kapso.ai/platform/v1";

export type KapsoMessageStatusResult =
  | {
      ok: true;
      status: string | null;
      direction: string | null;
    }
  | { ok: false; error: string };

type KapsoMessageEnvelope = {
  data?: {
    kapso?: { status?: string; direction?: string };
  };
  kapso?: { status?: string; direction?: string };
  error?: string;
};

/** Normalize Platform GET body (`{ data }` or bare message). */
export function parseKapsoMessageStatusPayload(
  json: KapsoMessageEnvelope,
): { status: string | null; direction: string | null } {
  const kapso = json.data?.kapso ?? json.kapso;
  return {
    status: kapso?.status ?? null,
    direction: kapso?.direction ?? null,
  };
}

/** Platform GET /whatsapp/messages/{id} — used to reconcile Kapso inbox read → CRM. */
export async function getKapsoMessageStatus(
  messageId: string,
): Promise<KapsoMessageStatusResult> {
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Falta KAPSO_API_KEY." };
  }

  const id = encodeURIComponent(messageId.trim());
  const res = await fetch(`${KAPSO_PLATFORM}/whatsapp/messages/${id}`, {
    headers: { "X-API-Key": apiKey },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as KapsoMessageEnvelope;

  if (!res.ok) {
    return {
      ok: false,
      error: json.error ?? `Kapso get message failed (${res.status})`,
    };
  }

  const parsed = parseKapsoMessageStatusPayload(json);
  return {
    ok: true,
    status: parsed.status,
    direction: parsed.direction,
  };
}
