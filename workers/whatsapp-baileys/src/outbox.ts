import { assertOutboundAllowed } from "./safety.js";
import type { WAMessage, WASocket } from "baileys";
import { WAMessageStatus } from "baileys";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncNativeChatUnread, assignCrmLabelAfterSent } from "./labels.js";
import {
  claimOutbox,
  cleanupNotOnWhatsAppOrphan,
  bindResolvedPnJid,
  fetchConnection,
  hasCampaignOutboxDraining,
  markMessageDeleted,
  markMessageDelivery,
  markOutboxFailed,
  markOutboxSent,
  patchConnection,
  reclaimOrphanSending,
  releaseOutboxToPending,
  type OutboxRow,
} from "./db.js";
import {
  audioDurationSec,
  needsOggTranscode,
  toOggOpusPtt,
} from "./transcode-audio.js";
import type { MessageCache } from "./socket.js";
import { resolveQuoteChatJid } from "./wa-message-build.js";
import { resolveWorkerSectorId } from "./sector.js";
import {
  isCobranzasCampaignRef,
  isRateLimitError,
  isWithinSendWindow,
  jitterDelayMs,
  todayDateInTz,
} from "./pacing.js";
import { resolveCampaignPacing } from "./pacing-cobranzas.js";
import {
  isCampaignDrainingState,
  msUntilWireMinGap,
  nextWakeMs,
} from "./wire-clock.js";

const MEDIA_BUCKET = "whatsapp-media";

/** Cooldown entre envíos de campaña (también se extiende tras CRM si draining). */
let campaignCooldownUntilMs = 0;
/** Último sendMessage exitoso (campaña o CRM) en este proceso. */
let lastWireSendAtMs = 0;
/** Wake para CRM retenido por gap mín. de cable. */
let crmWireReadyUntilMs = 0;

/** ms hasta el próximo wake de outbox (campaña cooldown o CRM wire gap). */
export function msUntilCampaignCooldownEnds(): number {
  return nextWakeMs({
    campaignCooldownUntilMs,
    crmWireReadyUntilMs,
    nowMs: Date.now(),
  });
}

function noteWireSendSuccess() {
  lastWireSendAtMs = Date.now();
}

function e164ToDigits(e164: string): string {
  return e164.replace(/^\+/, "");
}

async function resolveJid(sock: WASocket, toE164: string): Promise<string> {
  const digits = e164ToDigits(toE164);
  // Baileys onWhatsApp accepts raw digits or full JID; prefer digits + country.
  const results = await sock.onWhatsApp(digits);
  const hit = results?.find((r) => r.exists && r.jid);
  if (!hit?.jid) {
    throw new Error(`not_on_whatsapp:${toE164}`);
  }
  return hit.jid;
}

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "ogg" || ext === "opus") return "audio/ogg; codecs=opus";
  if (ext === "webm") return "audio/webm";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

async function downloadMedia(
  supabase: SupabaseClient,
  path: string,
): Promise<Buffer> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const ownership = await supabase.rpc("wis_media_sector", { p_name: path });
  if (ownership.error || ownership.data !== sectorId) throw new Error("media_sector_mismatch");
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .download(path);
  if (error || !data) {
    throw new Error(error?.message ?? "media_download_failed");
  }
  return Buffer.from(await data.arrayBuffer());
}

function quotedMessageContent(
  type: string | undefined,
  body: string,
): NonNullable<WAMessage["message"]> {
  switch (type) {
    case "image":
      return { imageMessage: { caption: body || undefined } };
    case "audio":
      return { audioMessage: { ptt: true } };
    case "document":
      return { documentMessage: { fileName: body || "Documento" } };
    default:
      return { conversation: body || "…" };
  }
}

/**
 * Rebuild a minimal WAMessage for Baileys `options.quoted`
 * (README: sock.sendMessage(jid, content, { quoted })).
 *
 * Use the conversation chat JID (often @lid), not the PN send JID — otherwise
 * Baileys omits contextInfo.remoteJid and WhatsApp shows plain text.
 */
async function buildQuotedMessage(
  supabase: SupabaseClient,
  sendJid: string,
  conversationId: string | null,
  quotedWaMessageId: string,
  messageCache: MessageCache,
): Promise<WAMessage> {
  const quoteChatJid = await resolveQuoteChatJid(
    supabase,
    conversationId,
    sendJid,
  );

  const sectorId = await resolveWorkerSectorId(supabase);
  let quotedQuery = supabase
    .from("messages")
    .select("direction, type, body, wa_sender_jid")
    .eq("sector_id", sectorId)
    .eq("wa_message_id", quotedWaMessageId);
  if (conversationId) {
    quotedQuery = quotedQuery.eq("conversation_id", conversationId);
  }
  const { data } = await quotedQuery.maybeSingle();

  const fromMe = data?.direction === "out";
  const body =
    typeof data?.body === "string" && data.body.trim()
      ? data.body
      : data?.type === "image"
        ? "Imagen"
        : data?.type === "audio"
          ? "Audio"
          : data?.type === "document"
            ? "Documento"
            : "";

  const key: WAMessage["key"] = {
    remoteJid: quoteChatJid,
    fromMe,
    id: quotedWaMessageId,
  };
  if (!fromMe && data?.wa_sender_jid) {
    key.participant = data.wa_sender_jid as string;
  }

  const cached = messageCache.get(quotedWaMessageId);
  const message =
    cached != null
      ? (cached as NonNullable<WAMessage["message"]>)
      : quotedMessageContent(data?.type as string | undefined, body);

  console.log(
    JSON.stringify({
      event: "outbox_quoted_build",
      quotedWaMessageId,
      sendJid,
      quoteChatJid,
      fromMe,
      cacheHit: cached != null,
    }),
  );

  return { key, message };
}

async function sendRow(
  sock: WASocket,
  supabase: SupabaseClient,
  row: OutboxRow,
  messageCache: MessageCache,
): Promise<boolean> {
  let wireAttempted = false;
  try {
    await assertOutboundAllowed(supabase, { phone: row.to_e164, conversationId: row.conversation_id, campaign: row.purpose === "campaign" || isCobranzasCampaignRef(row.client_ref) });
    let jid: string;
    if (row.to_jid) {
      if (row.conversation_id) {
        const { data: conv } = await supabase
          .from("conversations")
          .select("wa_chat_id, kind")
          .eq("id", row.conversation_id)
          .maybeSingle();
        if (
          !conv ||
          conv.kind !== "group" ||
          conv.wa_chat_id !== row.to_jid ||
          !String(row.to_jid).endsWith("@g.us")
        ) {
          await markOutboxFailed(
            supabase,
            row.id,
            "to_jid_conversation_mismatch",
            row.message_id,
          );
          return false;
        }
      } else if (!String(row.to_jid).endsWith("@g.us")) {
        await markOutboxFailed(
          supabase,
          row.id,
          "to_jid_not_group",
          row.message_id,
        );
        return false;
      }
      jid = row.to_jid;
    } else if (row.to_e164) {
      jid = await resolveJid(sock, row.to_e164);
      await bindResolvedPnJid(supabase, {
        toE164: row.to_e164,
        conversationId: row.conversation_id,
        jid,
      });
    } else {
      await markOutboxFailed(
        supabase,
        row.id,
        "missing_destination",
        row.message_id,
      );
      return false;
    }

    const quoted = row.quoted_wa_message_id
      ? await buildQuotedMessage(
          supabase,
          jid,
          row.conversation_id,
          row.quoted_wa_message_id,
          messageCache,
        )
      : undefined;
    const opts = quoted ? { quoted } : undefined;

    let sent;

    if (row.type === "text") {
      if (!row.body) {
        await markOutboxFailed(supabase, row.id, "empty_text", row.message_id);
        return false;
      }
      await assertOutboundAllowed(supabase, { phone: row.to_e164, conversationId: row.conversation_id, campaign: row.purpose === "campaign" || isCobranzasCampaignRef(row.client_ref) });
      wireAttempted = true;
      sent = await sock.sendMessage(jid, { text: row.body }, opts);
    } else if (
      row.type === "image" ||
      row.type === "audio" ||
      row.type === "document"
    ) {
      if (!row.media_bucket_path) {
        await markOutboxFailed(
          supabase,
          row.id,
          "missing_media_path",
          row.message_id,
        );
        return false;
      }
      const buffer = await downloadMedia(supabase, row.media_bucket_path);
      const mimetype = mimeFromPath(row.media_bucket_path);
      const fileName =
        row.body?.slice(0, 80) ||
        row.media_bucket_path.split("/").pop() ||
        "archivo";

      if (row.type === "image") {
        await assertOutboundAllowed(supabase, { phone: row.to_e164, conversationId: row.conversation_id, campaign: row.purpose === "campaign" || isCobranzasCampaignRef(row.client_ref) });
      wireAttempted = true;
      sent = await sock.sendMessage(
          jid,
          {
            image: buffer,
            caption: row.body ?? undefined,
            mimetype,
          },
          opts,
        );
      } else if (row.type === "audio") {
        let audioBuffer = buffer;
        let audioMime = mimetype;
        let seconds = 1;
        const ext = row.media_bucket_path.split(".").pop() ?? "webm";
        if (needsOggTranscode(mimetype, row.media_bucket_path)) {
          try {
            const converted = await toOggOpusPtt(buffer, ext);
            audioBuffer = converted.buffer;
            audioMime = converted.mimetype;
            seconds = converted.seconds;
            console.log(
              JSON.stringify({
                event: "outbox_audio_transcoded",
                path: row.media_bucket_path,
                bytesIn: buffer.length,
                bytesOut: audioBuffer.length,
                seconds,
              }),
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("outbox_audio_transcode_failed");
            await markOutboxFailed(
              supabase,
              row.id,
              `audio_transcode_failed:${msg}`,
              row.message_id,
            );
            return false;
          }
        } else {
          seconds = await audioDurationSec(buffer, ext);
        }
        await assertOutboundAllowed(supabase, { phone: row.to_e164, conversationId: row.conversation_id, campaign: row.purpose === "campaign" || isCobranzasCampaignRef(row.client_ref) });
      wireAttempted = true;
      sent = await sock.sendMessage(
          jid,
          {
            audio: audioBuffer,
            mimetype: audioMime,
            ptt: true,
            seconds,
          },
          opts,
        );
      } else {
        await assertOutboundAllowed(supabase, { phone: row.to_e164, conversationId: row.conversation_id, campaign: row.purpose === "campaign" || isCobranzasCampaignRef(row.client_ref) });
      wireAttempted = true;
      sent = await sock.sendMessage(
          jid,
          {
            document: buffer,
            mimetype,
            fileName,
          },
          opts,
        );
      }
    } else {
      await markOutboxFailed(
        supabase,
        row.id,
        `unsupported_type:${row.type}`,
        row.message_id,
      );
      return false;
    }

    const id = sent?.key?.id;
    if (id && sent?.message) {
      messageCache.set(id, sent.message);
    }
    if (!id) throw new Error("missing_wa_message_id");
    await markOutboxSent(supabase, row.id, id, row.message_id, {
      countDailyCap: isCobranzasCampaignRef(row.client_ref),
    });
    noteWireSendSuccess();
    // Assign campaign label after sent — never revert sent on assign failure (S27).
    await assignCrmLabelAfterSent(supabase, row);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (wireAttempted) {
      const { error } = await supabase.from("whatsapp_outbox").update({status: "outcome_unknown", last_error: "wire_result_requires_reconciliation"}).eq("id", row.id).eq("status", "sending");
      if (error) throw error;
    } else {
      await markOutboxFailed(supabase, row.id, "preflight_rejected:" + (/^[a-z_]+$/.test(msg) ? msg : "validation_failed"), row.message_id);
    }
    return false;
  }
}

async function releaseMany(
  supabase: SupabaseClient,
  rows: OutboxRow[],
  reason: string,
) {
  for (const row of rows) {
    await releaseOutboxToPending(supabase, row.id, row.attempts, reason);
  }
}

/**
 * Drena outbox del sector del worker.
 * Sin campaña draining → CRM/send-test inmediato; campañas con pacing.
 * Con draining (ADR 005): CRM respeta ≥ delay_min desde último wire;
 * tras CRM, campaña espera jitter completo; sin sleep largo en el tick.
 */
export async function drainOutbox(
  sock: WASocket,
  supabase: SupabaseClient,
  messageCache: MessageCache,
) {
  await assertOutboundAllowed(supabase);
  const conn = await fetchConnection(supabase);
  if (!conn || conn.status !== "connected") return;

  await reclaimOrphanSending(supabase);

  const claimBatch = 20;
  const rows = await claimOutbox(supabase, claimBatch);
  if (rows.length === 0) return;

  const crmRows = rows.filter((r) => !isCobranzasCampaignRef(r.client_ref));
  const campaignRows = rows.filter((r) => isCobranzasCampaignRef(r.client_ref));

  const nowMs = Date.now();
  const hasCampaignOutbox =
    campaignRows.length > 0 || (await hasCampaignOutboxDraining(supabase));
  const draining = isCampaignDrainingState({
    hasCampaignOutbox,
    campaignCooldownUntilMs,
    nowMs,
  });

  let wireCfg = null as Awaited<ReturnType<typeof resolveCampaignPacing>> | null;
  if (draining && (crmRows.length > 0 || campaignRows.length > 0)) {
    const leadRef = campaignRows[0]?.client_ref ?? crmRows[0]?.client_ref;
    wireCfg = await resolveCampaignPacing(leadRef);
  }

  if (crmRows.length > 0) {
    if (draining && wireCfg) {
      const waitMs = msUntilWireMinGap({
        lastWireSendAtMs,
        delayMinMs: wireCfg.cfg.delayMinMs,
        nowMs: Date.now(),
      });
      if (waitMs > 0) {
        crmWireReadyUntilMs = Date.now() + waitMs;
        console.log(
          JSON.stringify({
            event: "wire_pacing_hold",
            reason: "wire_cooldown",
            waitMs,
            pacing_source: wireCfg.source,
            sectorSlug: wireCfg.sectorSlug,
          }),
        );
        await releaseMany(supabase, crmRows, "wire_cooldown");
      } else {
        const [firstCrm, ...restCrm] = crmRows;
        const ok = firstCrm
          ? await sendRow(sock, supabase, firstCrm, messageCache)
          : false;
        if (ok && wireCfg) {
          campaignCooldownUntilMs = Date.now() + jitterDelayMs(wireCfg.cfg);
          crmWireReadyUntilMs = lastWireSendAtMs + wireCfg.cfg.delayMinMs;
          console.log(
            JSON.stringify({
              event: "wire_pacing_after_crm",
              campaignCooldownUntilMs,
              delayMinMs: wireCfg.cfg.delayMinMs,
              pacing_source: wireCfg.source,
            }),
          );
        }
        if (restCrm.length > 0) {
          await releaseMany(supabase, restCrm, "wire_cooldown");
        }
      }
    } else {
      for (const row of crmRows) {
        await sendRow(sock, supabase, row, messageCache);
      }
    }
  }

  if (campaignRows.length === 0) return;

  const lead = campaignRows[0]!;
  const { cfg, source, sectorSlug } =
    wireCfg ?? (await resolveCampaignPacing(lead.client_ref));
  console.log(
    JSON.stringify({
      event: "campaign_pacing_resolved",
      pacing_source: source,
      sectorSlug,
      horaInicio: cfg.horaInicio,
      horaFin: cfg.horaFin,
      maxMsgsDia: cfg.maxMsgsDia,
    }),
  );

  const today = todayDateInTz(cfg.tz);
  let sendsToday =
    conn.sends_today_date === today ? Number(conn.sends_today ?? 0) : 0;
  if (conn.sends_today_date !== today) {
    await patchConnection(supabase, {
      sends_today: 0,
      sends_today_date: today,
    });
    sendsToday = 0;
  }

  const afterCrm = await fetchConnection(supabase);
  const circuitOpen =
    !!afterCrm?.circuit_open_until &&
    new Date(afterCrm.circuit_open_until).getTime() > Date.now();
  const withinWindow = isWithinSendWindow(cfg);
  const sendsAfter =
    afterCrm?.sends_today_date === today
      ? Number(afterCrm.sends_today ?? sendsToday)
      : sendsToday;
  const underCap = sendsAfter < cfg.maxMsgsDia;
  const cooldownOk = Date.now() >= campaignCooldownUntilMs;
  const wireGapOk =
    msUntilWireMinGap({
      lastWireSendAtMs,
      delayMinMs: cfg.delayMinMs,
      nowMs: Date.now(),
    }) === 0;

  if (circuitOpen || !withinWindow || !underCap || !cooldownOk || !wireGapOk) {
    let reason = "campaign_hold";
    if (circuitOpen) reason = "campaign_circuit_open";
    else if (!withinWindow) reason = "campaign_outside_window";
    else if (!underCap) reason = "campaign_daily_cap";
    else if (!cooldownOk) reason = "campaign_cooldown";
    else if (!wireGapOk) reason = "wire_cooldown";
    console.log(
      JSON.stringify({
        event: "campaign_pacing_hold",
        reason,
        pacing_source: source,
        sectorSlug,
      }),
    );
    await releaseMany(supabase, campaignRows, reason);

    if (!underCap && !circuitOpen) {
      const until = new Date(`${today}T23:59:59-03:00`).toISOString();
      await patchConnection(supabase, {
        circuit_open_until: until,
        circuit_reason: "daily_cap",
        last_error: `daily_cap ${cfg.maxMsgsDia} reached (${today})`,
      });
    }
    return;
  }

  // Un envío de campaña por tick + cooldown desde último wire.
  const [first, ...rest] = campaignRows;
  if (rest.length > 0) {
    await releaseMany(supabase, rest, "campaign_claim_overflow");
  }
  if (!first) return;

  const sentOk = await sendRow(sock, supabase, first, messageCache);

  const after = await fetchConnection(supabase);
  if (
    after?.circuit_open_until &&
    new Date(after.circuit_open_until).getTime() > Date.now()
  ) {
    // 429: no programar cooldown extra; circuit pausa campañas.
    return;
  }
  if (!sentOk) return;

  campaignCooldownUntilMs = Date.now() + jitterDelayMs(cfg);
  crmWireReadyUntilMs = lastWireSendAtMs + cfg.delayMinMs;
  console.log(
    JSON.stringify({
      event: "campaign_pacing_cooldown",
      untilMs: campaignCooldownUntilMs,
      delayMs: campaignCooldownUntilMs - Date.now(),
      pacing_source: source,
    }),
  );
}

function mapWaStatus(
  status: number,
): "pending" | "sent" | "delivered" | "read" | "failed" | null {
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
      return null;
  }
}

const RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 99,
};

/** Receipts that arrived before the CRM row existed (fromMe race). */
const pendingReceipts = new Map<
  string,
  { status: "pending" | "sent" | "delivered" | "read" | "failed"; at: number }
>();

const PENDING_RECEIPT_TTL_MS = 5 * 60 * 1000;

function rememberPendingReceipt(
  waId: string,
  status: "pending" | "sent" | "delivered" | "read" | "failed",
) {
  const prev = pendingReceipts.get(waId);
  if (prev && (RANK[status] ?? 0) < (RANK[prev.status] ?? 0)) return;
  pendingReceipts.set(waId, { status, at: Date.now() });
}

/** Apply a buffered receipt after insert; returns status if any. */
export function takePendingReceipt(
  waId: string,
): "pending" | "sent" | "delivered" | "read" | "failed" | null {
  const hit = pendingReceipts.get(waId);
  if (!hit) return null;
  pendingReceipts.delete(waId);
  if (Date.now() - hit.at > PENDING_RECEIPT_TTL_MS) return null;
  return hit.status;
}

function prunePendingReceipts() {
  const now = Date.now();
  for (const [id, v] of pendingReceipts) {
    if (now - v.at > PENDING_RECEIPT_TTL_MS) pendingReceipts.delete(id);
  }
}

type DeliveryRank = "pending" | "sent" | "delivered" | "read" | "failed";

function receiptTimestampSet(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number") return value > 0;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber() > 0;
  }
  return Number(value) > 0;
}

async function applyOutboundDeliveryUpdate(
  supabase: SupabaseClient,
  waId: string,
  next: DeliveryRank,
) {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: row, error } = await supabase
    .from("messages")
    .select("id, delivery_status, direction")
    .eq("sector_id", sectorId)
    .eq("wa_message_id", waId)
    .maybeSingle();
  if (error) return;
  if (!row) {
    rememberPendingReceipt(waId, next);
    return;
  }
  if (row.direction !== "out") return;

  const current = row.delivery_status as string;
  if (current === "failed") return;
  if ((RANK[next] ?? 0) < (RANK[current] ?? 0)) return;
  if (next === current) return;

  await markMessageDelivery(supabase, row.id, next);
}

export async function handleMessageUpdates(
  supabase: SupabaseClient,
  updates: Array<{
    key: {
      id?: string | null;
      fromMe?: boolean | null;
      remoteJid?: string | null;
    };
    update: {
      status?: number | null;
      message?: unknown | null;
      messageStubType?: number | null;
    };
  }>,
) {
  prunePendingReceipts();
  for (const { key, update } of updates) {
    const waId = key.id;
    if (waId && (update.message === null || update.messageStubType != null)) {
      const marked = await markMessageDeleted(supabase, { waMessageId: waId });
      if (marked) {
        console.log(
          JSON.stringify({
            event: "message_revoked_update",
            waMessageId: waId,
          }),
        );
        continue;
      }
    }

    // Another device read an inbound → native unread, not outbound ticks.
    if (
      key.fromMe === false &&
      update.status === WAMessageStatus.READ &&
      key.remoteJid
    ) {
      await syncNativeChatUnread(supabase, {
        chatId: key.remoteJid,
        unreadCount: 0,
        source: "messages.update:read",
        trustReadZero: true,
      });
      continue;
    }

    // Ticks apply to outbound CRM rows only (inbound also has wa_message_id).
    if (key.fromMe === false) continue;
    if (!waId || update.status == null) continue;
    const next = mapWaStatus(update.status);
    if (!next) continue;
    await applyOutboundDeliveryUpdate(supabase, waId, next);
  }
}

/** Hard remove from CRM when cleared locally (delete for me on device). */
export async function handleMessageDeletes(
  supabase: SupabaseClient,
  item: { keys: Array<{ id?: string | null }> } | { jid: string; all: true },
) {
  if (!("keys" in item)) return;

  const sectorId = await resolveWorkerSectorId(supabase);
  for (const key of item.keys) {
    const waId = key.id;
    if (!waId) continue;
    const { data } = await supabase
      .from("messages")
      .select("id, deleted_at")
      .eq("sector_id", sectorId)
      .eq("wa_message_id", waId)
      .maybeSingle();
    if (!data?.id || data.deleted_at) continue;
    const { error } = await supabase.from("messages").delete().eq("id", data.id);
    if (error) {
      console.error("message_delete_crm_failed");
      continue;
    }
    console.log(
      JSON.stringify({
        event: "message_deleted_for_me",
        waMessageId: waId,
        messageId: data.id,
      }),
    );
  }
}

/** Group outbound ticks: Baileys emits per-participant receipts, not messages.update. */
export async function handleMessageReceiptUpdates(
  supabase: SupabaseClient,
  updates: Array<{
    key: { id?: string | null; fromMe?: boolean | null };
    receipt: {
      receiptTimestamp?: unknown;
      readTimestamp?: unknown;
    };
  }>,
) {
  prunePendingReceipts();
  for (const { key, receipt } of updates) {
    if (key.fromMe === false) continue;
    const waId = key.id;
    if (!waId) continue;

    const next: DeliveryRank | null = receiptTimestampSet(receipt.readTimestamp)
      ? "read"
      : receiptTimestampSet(receipt.receiptTimestamp)
        ? "delivered"
        : null;
    if (!next) continue;

    await applyOutboundDeliveryUpdate(supabase, waId, next);
  }
}
