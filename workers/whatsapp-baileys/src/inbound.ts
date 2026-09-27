import { messageTimestampIso } from "./history.js";
import {
  downloadMediaMessage,
  getContentType,
  isJidGroup,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  WAMessageStatus,
  type WAMessage,
  type WASocket,
} from "baileys";
import type { SupabaseClient } from "@supabase/supabase-js";
import pino from "pino";
import {
  upsertContactConversation,
  upsertGroupConversation,
  insertLiveMessage,
  markMessageDelivery,
  type LiveMessageRow,
} from "./db.js";
import {
  classifyContentType,
  coerceUploadMime,
  extForMime,
  previewForMessage,
  type InboundV1Type,
} from "./inbound-classify.js";
import { takePendingReceipt } from "./outbox.js";
import { setCrmWaUnreadLabel } from "./labels.js";
import { resolveWorkerSectorId } from "./sector.js";

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
const mediaLogger = pino({ level: "silent" });

function unwrapContent(
  message: WAMessage["message"],
): NonNullable<WAMessage["message"]> | null {
  if (!message) return null;
  return (
    message.ephemeralMessage?.message ??
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message ??
    message.viewOnceMessageV2Extension?.message ??
    message.documentWithCaptionMessage?.message ??
    message
  );
}

function textBody(content: NonNullable<WAMessage["message"]>): string | null {
  if (content.conversation) return content.conversation;
  if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
  if (content.imageMessage?.caption) return content.imageMessage.caption;
  if (content.documentMessage?.caption) return content.documentMessage.caption;
  if (content.documentMessage?.fileName) return content.documentMessage.fileName;
  return null;
}

type ContextInfoLike = {
  stanzaId?: string | null;
  quotedMessage?: {
    conversation?: string | null;
    extendedTextMessage?: { text?: string | null } | null;
  } | null;
};

function extractContextInfo(
  content: NonNullable<WAMessage["message"]>,
): ContextInfoLike | null {
  const candidates: Array<ContextInfoLike | null | undefined> = [
    content.extendedTextMessage?.contextInfo as ContextInfoLike | undefined,
    content.imageMessage?.contextInfo as ContextInfoLike | undefined,
    content.audioMessage?.contextInfo as ContextInfoLike | undefined,
    content.documentMessage?.contextInfo as ContextInfoLike | undefined,
    content.buttonsResponseMessage?.contextInfo as ContextInfoLike | undefined,
  ];
  for (const ctx of candidates) {
    if (ctx?.stanzaId) return ctx;
  }
  return null;
}

function quotedPreviewFromContext(ctx: ContextInfoLike): string | null {
  const qm = ctx.quotedMessage;
  if (!qm) return null;
  const text =
    qm.conversation ||
    qm.extendedTextMessage?.text ||
    null;
  return text ? text.slice(0, 160) : null;
}

async function resolveQuotedFields(
  supabase: SupabaseClient,
  conversationId: string,
  content: NonNullable<WAMessage["message"]>,
): Promise<{
  quoted_message_id: string | null;
  quoted_wa_message_id: string | null;
  quoted_body_preview: string | null;
}> {
  const ctx = extractContextInfo(content);
  if (!ctx?.stanzaId) {
    return {
      quoted_message_id: null,
      quoted_wa_message_id: null,
      quoted_body_preview: null,
    };
  }
  const quotedWa = ctx.stanzaId;
  const preview = quotedPreviewFromContext(ctx);
  const { data } = await supabase
    .from("messages")
    .select("id, body, type")
    .eq("conversation_id", conversationId)
    .eq("wa_message_id", quotedWa)
    .maybeSingle();

  let bodyPreview = preview;
  if (!bodyPreview && data) {
    if (data.type === "text") bodyPreview = (data.body as string | null)?.slice(0, 160) ?? null;
    else if (data.type === "image") bodyPreview = "Imagen";
    else if (data.type === "audio") bodyPreview = "Audio";
    else if (data.type === "document") bodyPreview = "Documento";
  }

  return {
    quoted_message_id: (data?.id as string | undefined) ?? null,
    quoted_wa_message_id: quotedWa,
    quoted_body_preview: bodyPreview,
  };
}

function mediaMeta(
  content: NonNullable<WAMessage["message"]>,
  type: InboundV1Type,
): { mime: string | undefined; fileName: string | undefined } {
  if (type === "image" && content.imageMessage) {
    return {
      mime: content.imageMessage.mimetype ?? undefined,
      fileName: undefined,
    };
  }
  if (type === "audio" && content.audioMessage) {
    return {
      mime: content.audioMessage.mimetype ?? undefined,
      fileName: undefined,
    };
  }
  if (type === "document" && content.documentMessage) {
    return {
      mime: content.documentMessage.mimetype ?? undefined,
      fileName: content.documentMessage.fileName ?? undefined,
    };
  }
  return { mime: undefined, fileName: undefined };
}

function phoneFromPnJid(jid: string): string | null {
  const user = jidNormalizedUser(jid).split("@")[0];
  if (!user || !/^\d+$/.test(user)) return null;
  return `+${user}`;
}

function mapDeliveryStatus(
  status: WAMessage["status"] | null | undefined,
  fromMe: boolean,
): LiveMessageRow["delivery_status"] {
  if (!fromMe) return "delivered";
  switch (status) {
    case WAMessageStatus.ERROR:
      return "failed";
    case WAMessageStatus.PENDING:
      return "pending";
    case WAMessageStatus.SERVER_ACK:
      return "sent";
    case WAMessageStatus.DELIVERY_ACK:
      return "delivered";
    case WAMessageStatus.READ:
    case WAMessageStatus.PLAYED:
      return "read";
    default:
      return "sent";
  }
}

async function resolveIdentities(
  sock: WASocket,
  remoteJid: string,
): Promise<{
  waChatId: string;
  waJid: string | null;
  waLid: string | null;
  phoneE164: string | null;
}> {
  const normalized = jidNormalizedUser(remoteJid);
  if (isLidUser(normalized)) {
    let waJid: string | null = null;
    let phoneE164: string | null = null;
    try {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(normalized);
      if (pn && isPnUser(pn)) {
        waJid = jidNormalizedUser(pn);
        phoneE164 = phoneFromPnJid(waJid);
      }
    } catch {
      // LID→PN optional; chat still keyed by LID.
    }
    return {
      waChatId: normalized,
      waJid,
      waLid: normalized,
      phoneE164,
    };
  }

  if (isPnUser(normalized)) {
    return {
      waChatId: normalized,
      waJid: normalized,
      waLid: null,
      phoneE164: phoneFromPnJid(normalized),
    };
  }

  return {
    waChatId: normalized,
    waJid: normalized,
    waLid: null,
    phoneE164: null,
  };
}

async function uploadMedia(
  sock: WASocket,
  supabase: SupabaseClient,
  msg: WAMessage,
  type: InboundV1Type,
  conversationId: string,
  waMessageId: string,
  content: NonNullable<WAMessage["message"]>,
  fromMe: boolean,
): Promise<string | null> {
  if (type === "text") return null;

  const { mime } = mediaMeta(content, type);
  const contentType = coerceUploadMime(mime, type);
  if (!contentType) {
    console.log(
      JSON.stringify({
        event: "inbound_media_skip_mime",
        type,
        mime,
      }),
    );
    return null;
  }

  try {
    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      {
        logger: mediaLogger,
        reuploadRequest: sock.updateMediaMessage,
      },
    );
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

    const ext = extForMime(contentType, type);
    const folder = fromMe ? "device" : "inbound";
    const path = `${folder}/${conversationId}/${waMessageId}.${ext}`;
    const { error } = await supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      });
    if (error) {
      console.error("inbound_media_upload_failed");
      return null;
    }
    return path;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("inbound_media_download_failed");
    return null;
  }
}

export async function handleInboundMessages(
  sock: WASocket,
  supabase: SupabaseClient,
  messages: WAMessage[],
  source: "live" | "import" = "live",
) {
  for (const msg of messages) {
    try {
      await handleOne(sock, supabase, msg, source);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("inbound_handler_error", { code: "message_persistence_failed", source });
    }
  }
}

async function handleOne(
  sock: WASocket,
  supabase: SupabaseClient,
  msg: WAMessage,
  source: "live" | "import",
) {
  const messageAt = messageTimestampIso(msg.messageTimestamp);
  if (source === "import" && !messageAt) return;
  const fromMe = Boolean(msg.key.fromMe);
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid) return;
  if (remoteJid === "status@broadcast") return;

  const isGroup = isJidGroup(remoteJid);

  const content = unwrapContent(msg.message);
  if (!content) return;

  const contentType = getContentType(content);
  const classified = classifyContentType(contentType);
  if (classified.kind === "skip") {
    console.log(
      JSON.stringify({
        event: "inbound_skip",
        reason: classified.reason,
        remoteJid,
        fromMe,
        isGroup,
      }),
    );
    return;
  }

  const waMessageId = msg.key.id;
  if (!waMessageId) return;

  // Skip before media download/upload when already persisted (panel outbox echo / retries).
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: existing, error: existingErr } = await supabase
    .from("messages")
    .select("id, delivery_status")
    .eq("sector_id", sectorId)
    .eq("wa_message_id", waMessageId)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.id) {
    if (fromMe) {
      const pending = takePendingReceipt(waMessageId);
      const fromMsg = mapDeliveryStatus(msg.status, true);
      const rank: Record<string, number> = {
        pending: 0,
        sent: 1,
        delivered: 2,
        read: 3,
        failed: 99,
      };
      const current = existing.delivery_status as string;
      const candidates = [pending, fromMsg].filter(Boolean) as string[];
      let best = current;
      for (const c of candidates) {
        if ((rank[c] ?? 0) > (rank[best] ?? 0)) best = c;
      }
      if (best !== current && best !== "failed") {
        await markMessageDelivery(
          supabase,
          existing.id,
          best as LiveMessageRow["delivery_status"],
        );
      }
    }
    console.log(
      JSON.stringify({
        event: "inbound_skip",
        reason: "duplicate_wa_message_id",
        waMessageId,
        fromMe,
      }),
    );
    return;
  }

  const body = textBody(content);
  const preview = previewForMessage(classified.type, body);
  const waChatId = jidNormalizedUser(remoteJid);

  let conversationId: string;
  let waSenderJid: string | null = null;
  let waSenderName: string | null = null;

  if (isGroup) {
    let title: string | null = null;
    try {
      const meta = source === "live" ? await sock.groupMetadata(waChatId) : null;
      title = meta?.subject?.trim() || null;
    } catch {
      title = null;
    }
    const upserted = await upsertGroupConversation(supabase, {
      waChatId,
      title,
      preview,
      messageAt: messageAt ?? undefined,
    });
    conversationId = upserted.conversationId;
    if (!fromMe) {
      const participant = msg.key.participant
        ? jidNormalizedUser(msg.key.participant)
        : null;
      waSenderJid = participant;
      waSenderName = msg.pushName?.trim() || null;
    }
  } else {
    const identities = await resolveIdentities(sock, remoteJid);
    const pushName = fromMe ? "" : msg.pushName?.trim() || "";
    const upserted = await upsertContactConversation(supabase, {
      waChatId: identities.waChatId,
      waJid: identities.waJid,
      waLid: identities.waLid,
      phoneE164: identities.phoneE164,
      pushName,
      preview,
      messageAt: messageAt ?? undefined,
    });
    conversationId = upserted.conversationId;
  }

  const mediaPath = source === "import" ? null : await uploadMedia(
    sock,
    supabase,
    msg,
    classified.type,
    conversationId,
    waMessageId,
    content,
    fromMe,
  );

  let delivery = mapDeliveryStatus(msg.status, fromMe);
  if (fromMe) {
    const pending = takePendingReceipt(waMessageId);
    const rank: Record<string, number> = {
      pending: 0,
      sent: 1,
      delivered: 2,
      read: 3,
      failed: 99,
    };
    if (pending && (rank[pending] ?? 0) > (rank[delivery] ?? 0)) {
      delivery = pending;
    }
  }

  const quote = await resolveQuotedFields(supabase, conversationId, content);

  const row: LiveMessageRow = {
    conversation_id: conversationId,
    wa_message_id: waMessageId,
    direction: fromMe ? "out" : "in",
    type: classified.type,
    body,
    media_bucket_path: mediaPath,
    sent_by: null,
    delivery_status: delivery,
    source,
    ...(messageAt ? { created_at: messageAt } : {}),
    wa_sender_jid: waSenderJid,
    wa_sender_name: waSenderName,
    quoted_message_id: quote.quoted_message_id,
    quoted_wa_message_id: quote.quoted_wa_message_id,
    quoted_body_preview: quote.quoted_body_preview,
  };

  const inserted = await insertLiveMessage(supabase, row);
  console.log(
    JSON.stringify({
      event: fromMe
        ? "device_outbound_saved"
        : isGroup
          ? "inbound_group_saved"
          : "inbound_saved",
      waMessageId,
      type: classified.type,
      inserted,
      hasMedia: Boolean(mediaPath),
      delivery_status: row.delivery_status,
      isGroup,
    }),
  );

  // Native WA unread ≠ labels.association for «No leídos»; mirror on inbound.
  if (source === "live" && !fromMe && inserted) {
    try {
      await setCrmWaUnreadLabel(supabase, conversationId, true, "inbound", {
        writeBackWa: true,
      });
    } catch (err) {
      console.error("inbound_unread_label_sync_failed");
    }
  }
}
