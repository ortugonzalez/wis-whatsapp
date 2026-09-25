import type { SupabaseClient } from "@supabase/supabase-js";
import { computeDisplayName } from "@/lib/contacts/display-name";
import { setKapsoCrmUnreadLabel } from "@/lib/kapso/crm-unread";
import {
  extractBizOpaque,
  parseCrmOpaqueMessageId,
  pickPendingCrmOutbound,
  resolveOutboundOrigin,
  type OutboundOrigin,
} from "@/lib/kapso/outbound-origin";
import { e164ToWaChatId, normalizeArE164 } from "@/lib/phone/ar-e164";

export const KAPSO_SECTOR_SLUG = "kapso-demo";

export type KapsoIngestResult =
  | { ok: true; skipped?: "duplicate" | "idempotent" | "ignored_event" }
  | { ok: false; error: string };

type KapsoMessagePayload = {
  message?: {
    id?: string;
    timestamp?: string;
    type?: string;
    from?: string | null;
    text?: { body?: string };
    biz_opaque_callback_data?: string | null;
    template?: { name?: string };
    kapso?: {
      direction?: string;
      status?: string;
      content?: string | null;
      origin?: string;
      biz_opaque_callback_data?: string | null;
      statuses?: Array<{ biz_opaque_callback_data?: string | null }>;
    };
  };
  conversation?: {
    id?: string | null;
    phone_number?: string | null;
    contact_name?: string | null;
  };
  phone_number_id?: string;
};

function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ar = normalizeArE164(raw);
  if (ar) return ar;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function mapMessageType(
  type: string | undefined,
): "text" | "image" | "audio" | "document" {
  switch (type) {
    case "image":
      return "image";
    case "audio":
    case "voice":
      return "audio";
    case "document":
      return "document";
    // Templates and interactive stay as text row with body preview (single thread).
    default:
      return "text";
  }
}

function mapDirection(
  kapsoDir: string | undefined,
  event: string,
): "in" | "out" | null {
  if (kapsoDir === "inbound") return "in";
  if (kapsoDir === "outbound") return "out";
  if (event === "whatsapp.message.received") return "in";
  if (
    event === "whatsapp.message.sent" ||
    event === "whatsapp.message.delivered" ||
    event === "whatsapp.message.read" ||
    event === "whatsapp.message.failed"
  ) {
    return "out";
  }
  return null;
}

function mapDeliveryStatus(
  event: string,
  kapsoStatus: string | undefined,
): "pending" | "sent" | "delivered" | "read" | "failed" {
  if (event === "whatsapp.message.failed" || kapsoStatus === "failed") {
    return "failed";
  }
  if (event === "whatsapp.message.read" || kapsoStatus === "read") return "read";
  if (event === "whatsapp.message.delivered" || kapsoStatus === "delivered") {
    return "delivered";
  }
  if (event === "whatsapp.message.sent" || kapsoStatus === "sent") return "sent";
  return "pending";
}

async function resolveKapsoSectorId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("sectors")
    .select("id")
    .eq("slug", KAPSO_SECTOR_SLUG)
    .eq("channel_provider", "kapso")
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * When Kapso does not echo `biz_opaque_callback_data`, the outbound webhook can
 * race the CRM insert. Attach wamid to the pending CRM row instead of inserting.
 */
async function claimPendingCrmOutbound(
  supabase: SupabaseClient,
  opts: {
    sectorId: string;
    conversationId: string;
    wamid: string;
    delivery: "pending" | "sent" | "delivered" | "read" | "failed";
    body: string | null;
  },
): Promise<{ ok: true; claimed: boolean } | { ok: false; error: string }> {
  const since = new Date(Date.now() - 120_000).toISOString();
  const { data: candidates, error } = await supabase
    .from("messages")
    .select("id, body, sent_by, outbound_origin")
    .eq("sector_id", opts.sectorId)
    .eq("conversation_id", opts.conversationId)
    .eq("direction", "out")
    .is("wa_message_id", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) return { ok: false, error: error.message };
  if (!candidates?.length) return { ok: true, claimed: false };

  const match = pickPendingCrmOutbound(candidates, opts.body);
  if (!match) return { ok: true, claimed: false };

  const { data: linked, error: updErr } = await supabase
    .from("messages")
    .update({
      wa_message_id: opts.wamid,
      delivery_status: opts.delivery,
      outbound_origin: "crm",
    })
    .eq("id", match.id)
    .is("wa_message_id", null)
    .select("id")
    .maybeSingle();

  if (updErr) {
    if (updErr.code === "23505") {
      // Another writer already claimed this wamid — treat as duplicate.
      return { ok: true, claimed: true };
    }
    return { ok: false, error: updErr.message };
  }
  if (linked?.id) return { ok: true, claimed: true };

  // Lost the race to CRM persist — wamid may already be on this or another row.
  const { data: byWamid } = await supabase
    .from("messages")
    .select("id")
    .eq("sector_id", opts.sectorId)
    .eq("wa_message_id", opts.wamid)
    .maybeSingle();
  return { ok: true, claimed: Boolean(byWamid?.id) };
}

async function upsertContactConversation(
  supabase: SupabaseClient,
  sectorId: string,
  e164: string,
  contactName: string | null | undefined,
  kapsoConversationId?: string | null,
): Promise<{ contactId: string; conversationId: string }> {
  const waChatId = e164ToWaChatId(e164);
  const displayName = computeDisplayName({
    phone_e164: e164,
    push_name: contactName?.trim() || "",
  });

  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("phone_e164", e164)
    .maybeSingle();

  let contactId = existingContact?.id as string | undefined;

  if (!contactId) {
    const { data: created, error } = await supabase
      .from("contacts")
      .insert({
        sector_id: sectorId,
        phone_e164: e164,
        wa_jid: waChatId,
        push_name: contactName?.trim() ?? "",
        agenda_name: "",
        verified_name: "",
        display_name: displayName,
      })
      .select("id")
      .single();

    if (error || !created) {
      const { data: raced } = await supabase
        .from("contacts")
        .select("id")
        .eq("sector_id", sectorId)
        .eq("phone_e164", e164)
        .maybeSingle();
      if (!raced?.id) throw error ?? new Error("contact upsert failed");
      contactId = raced.id as string;
    } else {
      contactId = created.id as string;
    }
  } else if (contactName?.trim()) {
    await supabase
      .from("contacts")
      .update({
        push_name: contactName.trim(),
        display_name: displayName,
      })
      .eq("id", contactId);
  }

  const { data: byChat } = await supabase
    .from("conversations")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("wa_chat_id", waChatId)
    .maybeSingle();

  if (byChat?.id) {
    if (kapsoConversationId?.trim()) {
      await supabase
        .from("conversations")
        .update({ kapso_conversation_id: kapsoConversationId.trim() })
        .eq("id", byChat.id)
        .is("kapso_conversation_id", null);
    }
    return { contactId, conversationId: byChat.id as string };
  }

  const { data: createdConv, error: convErr } = await supabase
    .from("conversations")
    .insert({
      sector_id: sectorId,
      contact_id: contactId,
      wa_chat_id: waChatId,
      kind: "direct",
      kapso_conversation_id: kapsoConversationId?.trim() || null,
    })
    .select("id")
    .single();

  if (convErr || !createdConv) {
    const { data: raced } = await supabase
      .from("conversations")
      .select("id")
      .eq("sector_id", sectorId)
      .eq("wa_chat_id", waChatId)
      .maybeSingle();
    if (!raced?.id) throw convErr ?? new Error("conversation upsert failed");
    return { contactId, conversationId: raced.id as string };
  }

  return { contactId, conversationId: createdConv.id as string };
}

/**
 * Ingest one Kapso phone webhook payload into sector kapso-8257.
 * Message events only; status-only updates for existing wamid.
 */
export async function ingestKapsoWebhookEvent(
  supabase: SupabaseClient,
  opts: {
    event: string;
    idempotencyKey: string | null;
    payload: KapsoMessagePayload;
  },
): Promise<KapsoIngestResult> {
  const { event, idempotencyKey, payload } = opts;

  // Kapso: check key first, mark processed only after success (at-least-once retries).
  if (idempotencyKey) {
    const { data: seen, error: seenErr } = await supabase
      .from("kapso_webhook_events")
      .select("idempotency_key")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (seenErr) return { ok: false, error: seenErr.message };
    if (seen) return { ok: true, skipped: "idempotent" };
  }

  const finish = async (
    result: KapsoIngestResult,
  ): Promise<KapsoIngestResult> => {
    if (!result.ok || !idempotencyKey) return result;
    const { error: idempErr } = await supabase
      .from("kapso_webhook_events")
      .insert({ idempotency_key: idempotencyKey, event });
    if (idempErr && idempErr.code !== "23505") {
      return { ok: false, error: idempErr.message };
    }
    return result;
  };

  const messageEvents = new Set([
    "whatsapp.message.received",
    "whatsapp.message.sent",
    "whatsapp.message.delivered",
    "whatsapp.message.read",
    "whatsapp.message.failed",
  ]);
  if (!messageEvents.has(event)) {
    return finish({ ok: true, skipped: "ignored_event" });
  }

  const sectorId = await resolveKapsoSectorId(supabase);
  if (!sectorId) {
    return { ok: false, error: `sector ${KAPSO_SECTOR_SLUG} missing` };
  }

  const msg = payload.message;
  const wamid = msg?.id?.trim();
  if (!wamid) {
    return { ok: false, error: "missing message.id (wamid)" };
  }

  const direction = mapDirection(msg?.kapso?.direction, event);
  if (!direction) {
    return finish({ ok: true, skipped: "ignored_event" });
  }

  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("wa_message_id", wamid)
    .maybeSingle();

  const delivery = mapDeliveryStatus(event, msg?.kapso?.status);
  const opaque = extractBizOpaque(payload);
  const crmMessageId = parseCrmOpaqueMessageId(opaque);

  // Race: webhook before CRM persisted wamid — attach by crm:{uuid}.
  if (!existing?.id && crmMessageId && direction === "out") {
    const { data: byCrm } = await supabase
      .from("messages")
      .select("id, wa_message_id")
      .eq("id", crmMessageId)
      .eq("sector_id", sectorId)
      .maybeSingle();
    if (byCrm?.id) {
      const { error: linkErr } = await supabase
        .from("messages")
        .update({
          wa_message_id: byCrm.wa_message_id ?? wamid,
          delivery_status: delivery,
          outbound_origin: "crm",
        })
        .eq("id", byCrm.id);
      if (linkErr) return { ok: false, error: linkErr.message };
      return finish({ ok: true, skipped: "duplicate" });
    }
  }

  if (existing?.id) {
    if (direction === "out" || event !== "whatsapp.message.received") {
      const { error: updErr } = await supabase
        .from("messages")
        .update({ delivery_status: delivery })
        .eq("id", existing.id);
      if (updErr) return { ok: false, error: updErr.message };
    }
    return finish({ ok: true, skipped: "duplicate" });
  }

  // Status events without a row yet: only materialize on received/sent (content).
  if (
    event === "whatsapp.message.delivered" ||
    event === "whatsapp.message.read"
  ) {
    return finish({ ok: true, skipped: "ignored_event" });
  }

  const e164 = toE164(
    direction === "in"
      ? (msg?.from ?? payload.conversation?.phone_number)
      : payload.conversation?.phone_number,
  );
  if (!e164) {
    return { ok: false, error: "missing peer phone (from / conversation)" };
  }

  const { conversationId } = await upsertContactConversation(
    supabase,
    sectorId,
    e164,
    payload.conversation?.contact_name,
    payload.conversation?.id,
  );

  const body =
    msg?.text?.body?.trim() ||
    msg?.kapso?.content?.trim() ||
    (msg?.type === "template" && msg.template?.name
      ? `[template] ${msg.template.name}`
      : null) ||
    (msg?.type && msg.type !== "text" ? `[${msg.type}]` : "") ||
    null;

  // Race without opaque echo: CRM already inserted a pending row; webhook would
  // otherwise create a second bubble (origin=system) and CRM wamid update hits unique.
  if (direction === "out") {
    const claimed = await claimPendingCrmOutbound(supabase, {
      sectorId,
      conversationId,
      wamid,
      delivery,
      body,
    });
    if (claimed.ok && claimed.claimed) {
      return finish({ ok: true, skipped: "duplicate" });
    }
    if (!claimed.ok) return { ok: false, error: claimed.error };
  }

  const outboundOrigin: OutboundOrigin | null =
    direction === "out" ? resolveOutboundOrigin(opaque) : null;

  const { error: insertErr } = await supabase.from("messages").insert({
    sector_id: sectorId,
    conversation_id: conversationId,
    wa_message_id: wamid,
    direction,
    type: mapMessageType(msg?.type),
    body,
    media_bucket_path: null,
    sent_by: null,
    delivery_status: direction === "in" ? "pending" : delivery,
    source: "live",
    outbound_origin: outboundOrigin,
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      return finish({ ok: true, skipped: "duplicate" });
    }
    return { ok: false, error: insertErr.message };
  }

  const preview = (body ?? "").slice(0, 160);
  const { error: convUpdErr } = await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview || null,
    })
    .eq("id", conversationId);
  if (convUpdErr) return { ok: false, error: convUpdErr.message };

  // Same CRM unread projection as Baileys inbound (ADR 004 label «No leídos»).
  if (direction === "in") {
    const unread = await setKapsoCrmUnreadLabel(
      supabase,
      sectorId,
      conversationId,
      true,
    );
    if (!unread.ok) {
      console.error("kapso_inbound_unread_label_failed", unread.error);
    }
  }

  return finish({ ok: true });
}
