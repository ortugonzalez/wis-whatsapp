import type { SupabaseClient } from "@supabase/supabase-js";
import { computeDisplayName } from "@/lib/contacts/display-name";
import {
  extractBizOpaque,
  resolveOutboundOrigin,
  type OutboundOrigin,
} from "@/lib/kapso/outbound-origin";
import { KAPSO_SECTOR_SLUG } from "@/lib/kapso/ingest-message";
import type { KapsoListedMessage } from "@/lib/kapso/list-messages";
import { listKapsoMessagesPage } from "@/lib/kapso/list-messages";
import { e164ToWaChatId, normalizeArE164 } from "@/lib/phone/ar-e164";
import { resolveKapsoPhoneNumberId } from "@/lib/kapso/send-text";

export type BackfillPageResult = {
  ok: true;
  scanned: number;
  inserted: number;
  skippedExisting: number;
  skippedNoPhone: number;
  mediaSkipped: number;
  after: string | null;
  dryRun: boolean;
};

function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ar = normalizeArE164(raw);
  if (ar) return ar;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function mapType(
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
    default:
      return "text";
  }
}

function mapDelivery(
  status: string | undefined,
): "pending" | "sent" | "delivered" | "read" | "failed" {
  switch (status) {
    case "failed":
      return "failed";
    case "read":
      return "read";
    case "delivered":
      return "delivered";
    case "sent":
      return "sent";
    default:
      return "pending";
  }
}

async function resolveSectorId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from("sectors")
    .select("id")
    .eq("slug", KAPSO_SECTOR_SLUG)
    .eq("channel_provider", "kapso")
    .maybeSingle();
  return data?.id ?? null;
}

async function upsertContactConversation(
  supabase: SupabaseClient,
  sectorId: string,
  e164: string,
  contactName: string | null | undefined,
): Promise<{ conversationId: string }> {
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
  }

  const { data: byChat } = await supabase
    .from("conversations")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("wa_chat_id", waChatId)
    .maybeSingle();
  if (byChat?.id) return { conversationId: byChat.id as string };

  const { data: createdConv, error: convErr } = await supabase
    .from("conversations")
    .insert({
      sector_id: sectorId,
      contact_id: contactId,
      wa_chat_id: waChatId,
      kind: "direct",
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
    return { conversationId: raced.id as string };
  }
  return { conversationId: createdConv.id as string };
}

function peerPhone(msg: KapsoListedMessage, direction: "in" | "out"): string | null {
  if (direction === "in") {
    return toE164(msg.from ?? msg.kapso?.phone_number);
  }
  return toE164(msg.kapso?.phone_number);
}

/**
 * Import one Kapso Platform messages page into kapso-8257.
 * Media: skip download — store type placeholder in body (documented).
 */
export async function backfillKapsoMessagesPage(
  supabase: SupabaseClient,
  opts: {
    phoneNumberId?: string | null;
    after?: string | null;
    limit?: number;
    dryRun?: boolean;
  },
): Promise<BackfillPageResult | { ok: false; error: string }> {
  const sectorId = await resolveSectorId(supabase);
  if (!sectorId) {
    return { ok: false, error: `Sector ${KAPSO_SECTOR_SLUG} missing` };
  }

  const phoneNumberId = resolveKapsoPhoneNumberId(opts.phoneNumberId);
  if (!phoneNumberId) {
    return { ok: false, error: "Falta KAPSO_PHONE_NUMBER_ID." };
  }

  const page = await listKapsoMessagesPage({
    phoneNumberId,
    limit: opts.limit ?? 20,
    after: opts.after,
  });
  if (!page.ok) return page;

  const dryRun = Boolean(opts.dryRun);
  let inserted = 0;
  let skippedExisting = 0;
  let skippedNoPhone = 0;
  let mediaSkipped = 0;
  const convMeta = new Map<string, { at: string; preview: string }>();

  for (const msg of page.messages) {
    const wamid = msg.id?.trim();
    if (!wamid) continue;

    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("sector_id", sectorId)
      .eq("wa_message_id", wamid)
      .maybeSingle();
    if (existing?.id) {
      skippedExisting += 1;
      continue;
    }

    const dirRaw = msg.kapso?.direction;
    const direction: "in" | "out" | null =
      dirRaw === "inbound" ? "in" : dirRaw === "outbound" ? "out" : null;
    if (!direction) {
      skippedNoPhone += 1;
      continue;
    }

    const e164 = peerPhone(msg, direction);
    if (!e164) {
      skippedNoPhone += 1;
      continue;
    }

    const hasMedia = Boolean(msg.kapso?.has_media);
    if (hasMedia) mediaSkipped += 1;

    const opaque = extractBizOpaque({ message: msg });
    const outboundOrigin: OutboundOrigin | null =
      direction === "out" ? resolveOutboundOrigin(opaque) : null;

    const body =
      msg.text?.body?.trim() ||
      msg.kapso?.content?.trim() ||
      (msg.type === "template" && msg.template?.name
        ? `[template] ${msg.template.name}`
        : null) ||
      (msg.type && msg.type !== "text" ? `[${msg.type}]` : "") ||
      null;

    if (dryRun) {
      inserted += 1;
      continue;
    }

    const { conversationId } = await upsertContactConversation(
      supabase,
      sectorId,
      e164,
      msg.kapso?.contact_name,
    );

    const tsSec = msg.timestamp ? Number(msg.timestamp) : NaN;
    const createdAt =
      Number.isFinite(tsSec) && tsSec > 0
        ? new Date(tsSec * 1000).toISOString()
        : undefined;

    const { error: insertErr } = await supabase.from("messages").insert({
      sector_id: sectorId,
      conversation_id: conversationId,
      wa_message_id: wamid,
      direction,
      type: mapType(msg.type),
      body,
      media_bucket_path: null,
      sent_by: null,
      delivery_status:
        direction === "in" ? "pending" : mapDelivery(msg.kapso?.status),
      source: "import",
      outbound_origin: outboundOrigin,
      ...(createdAt
        ? { created_at: createdAt, updated_at: createdAt }
        : {}),
    });

    if (insertErr) {
      if (insertErr.code === "23505") {
        skippedExisting += 1;
        continue;
      }
      return { ok: false, error: insertErr.message };
    }
    inserted += 1;

    if (createdAt) {
      const preview = (body ?? "").slice(0, 160);
      const prev = convMeta.get(conversationId);
      if (!prev || prev.at < createdAt) {
        convMeta.set(conversationId, { at: createdAt, preview });
      }
    }
  }

  for (const [conversationId, meta] of convMeta) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("last_message_at")
      .eq("id", conversationId)
      .maybeSingle();
    if (conv?.last_message_at && conv.last_message_at >= meta.at) continue;
    const { error: convErr } = await supabase
      .from("conversations")
      .update({
        last_message_at: meta.at,
        last_message_preview: meta.preview || null,
      })
      .eq("id", conversationId);
    if (convErr) return { ok: false, error: convErr.message };
  }

  return {
    ok: true,
    scanned: page.messages.length,
    inserted,
    skippedExisting,
    skippedNoPhone,
    mediaSkipped,
    after: page.after,
    dryRun,
  };
}
