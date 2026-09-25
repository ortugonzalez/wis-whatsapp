const KAPSO_PLATFORM = "https://api.kapso.ai/platform/v1";

export type KapsoListedMessage = {
  id: string;
  timestamp?: string;
  type?: string;
  from?: string | null;
  text?: { body?: string };
  template?: { name?: string };
  biz_opaque_callback_data?: string | null;
  kapso?: {
    direction?: string;
    status?: string;
    content?: string | null;
    phone_number?: string | null;
    contact_name?: string | null;
    phone_number_id?: string | null;
    has_media?: boolean;
    biz_opaque_callback_data?: string | null;
    statuses?: Array<{ biz_opaque_callback_data?: string | null }>;
  };
};

export type ListKapsoMessagesResult =
  | {
      ok: true;
      messages: KapsoListedMessage[];
      after: string | null;
    }
  | { ok: false; error: string };

/** One page from Kapso Platform GET /whatsapp/messages (newest first). */
export async function listKapsoMessagesPage(opts: {
  phoneNumberId: string;
  limit?: number;
  after?: string | null;
}): Promise<ListKapsoMessagesResult> {
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Falta KAPSO_API_KEY." };
  }

  const params = new URLSearchParams();
  params.set("phone_number_id", opts.phoneNumberId);
  params.set("limit", String(Math.min(Math.max(opts.limit ?? 20, 1), 100)));
  if (opts.after) params.set("after", opts.after);

  const res = await fetch(
    `${KAPSO_PLATFORM}/whatsapp/messages?${params.toString()}`,
    {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
    },
  );

  const json = (await res.json().catch(() => ({}))) as {
    data?: KapsoListedMessage[];
    paging?: { cursors?: { after?: string | null } };
    error?: string;
  };

  if (!res.ok) {
    return {
      ok: false,
      error: json.error ?? `Kapso list messages failed (${res.status})`,
    };
  }

  return {
    ok: true,
    messages: Array.isArray(json.data) ? json.data : [],
    after: json.paging?.cursors?.after ?? null,
  };
}
