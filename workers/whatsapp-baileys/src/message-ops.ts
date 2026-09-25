import type { WAMessage, WASocket } from "baileys";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertLiveMessage, markMessageDeleted, type LiveMessageRow } from "./db.js";
import {
  previewForMessage,
  type InboundV1Type,
} from "./inbound-classify.js";
import { resolveWorkerSectorId } from "./sector.js";
import type { MessageCache } from "./socket.js";
import { resolveQuoteChatJid } from "./wa-message-build.js";

export type MessageOpRow = {
  id: string;
  message_id: string;
  source_conversation_id: string;
  target_conversation_id: string | null;
  op: "forward" | "delete_for_me" | "delete_for_everyone";
  status: string;
  attempts: number;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  wa_message_id: string;
  direction: string;
  type: string;
  body: string | null;
  media_bucket_path: string | null;
  wa_sender_jid: string | null;
  created_at: string;
};

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

function bodyFromRow(row: MessageRow): string {
  if (typeof row.body === "string" && row.body.trim()) return row.body;
  if (row.type === "image") return "Imagen";
  if (row.type === "audio") return "Audio";
  if (row.type === "document") return "Documento";
  return "";
}

export async function buildWaMessageFromDb(
  supabase: SupabaseClient,
  row: MessageRow,
  chatJid: string,
  messageCache: MessageCache,
): Promise<WAMessage> {
  const fromMe = row.direction === "out";
  const key: WAMessage["key"] = {
    remoteJid: chatJid,
    fromMe,
    id: row.wa_message_id,
  };
  if (!fromMe && row.wa_sender_jid) {
    key.participant = row.wa_sender_jid;
  }

  const cached = messageCache.get(row.wa_message_id);
  const message =
    cached != null
      ? (cached as NonNullable<WAMessage["message"]>)
      : quotedMessageContent(row.type, bodyFromRow(row));

  return { key, message };
}

async function fetchMessageRow(
  supabase: SupabaseClient,
  messageId: string,
): Promise<MessageRow | null> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, wa_message_id, direction, type, body, media_bucket_path, wa_sender_jid, created_at",
    )
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.wa_message_id) return null;
  return data as MessageRow;
}

function waTimestamp(iso: string): string {
  return String(Math.floor(new Date(iso).getTime() / 1000));
}

export async function claimMessageOps(
  supabase: SupabaseClient,
  limit = 5,
): Promise<MessageOpRow[]> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: pending, error } = await supabase
    .from("whatsapp_message_ops")
    .select(
      "id, message_id, source_conversation_id, target_conversation_id, op, status, attempts",
    )
    .eq("sector_id", sectorId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!pending?.length) return [];

  const claimed: MessageOpRow[] = [];
  for (const row of pending) {
    const { data, error: updErr } = await supabase
      .from("whatsapp_message_ops")
      .update({
        status: "sending",
        attempts: (row.attempts ?? 0) + 1,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select(
        "id, message_id, source_conversation_id, target_conversation_id, op, status, attempts",
      )
      .maybeSingle();
    if (updErr) throw updErr;
    if (data) claimed.push(data as MessageOpRow);
  }
  return claimed;
}

export async function markMessageOpDone(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from("whatsapp_message_ops")
    .update({ status: "done", last_error: null })
    .eq("id", id);
  if (error) throw error;
}

export async function markMessageOpFailed(
  supabase: SupabaseClient,
  id: string,
  lastError: string,
) {
  const { error } = await supabase
    .from("whatsapp_message_ops")
    .update({ status: "failed", last_error: lastError.slice(0, 500) })
    .eq("id", id);
  if (error) throw error;
}

async function requeueMessageOp(
  supabase: SupabaseClient,
  id: string,
  lastError: string,
) {
  const { error } = await supabase
    .from("whatsapp_message_ops")
    .update({
      status: "pending",
      last_error: lastError.slice(0, 500),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function reclaimOrphanMessageOps(supabase: SupabaseClient) {
  const sectorId = await resolveWorkerSectorId(supabase);
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("whatsapp_message_ops")
    .update({ status: "pending", last_error: "reclaimed_orphan_sending" })
    .eq("sector_id", sectorId)
    .eq("status", "sending")
    .lt("updated_at", cutoff);
  if (error) throw error;
}

async function resolveConversationJid(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("wa_chat_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return (data?.wa_chat_id as string | null)?.trim() || null;
}

async function removeMessageFromCrm(
  supabase: SupabaseClient,
  messageId: string,
) {
  const { error } = await supabase.from("messages").delete().eq("id", messageId);
  if (error) throw error;
}

async function persistForwardedMessage(
  supabase: SupabaseClient,
  messageCache: MessageCache,
  input: {
    sourceRow: MessageRow;
    targetConversationId: string;
    waMessageId: string;
    sentMessage?: WAMessage["message"];
  },
) {
  const msgType = input.sourceRow.type as InboundV1Type;
  const preview = previewForMessage(msgType, input.sourceRow.body);
  const row: LiveMessageRow = {
    conversation_id: input.targetConversationId,
    wa_message_id: input.waMessageId,
    direction: "out",
    type: input.sourceRow.type,
    body: input.sourceRow.body,
    media_bucket_path: input.sourceRow.media_bucket_path,
    sent_by: null,
    delivery_status: "sent",
    source: "live",
  };

  const inserted = await insertLiveMessage(supabase, row);
  const now = new Date().toISOString();
  const { error: convErr } = await supabase
    .from("conversations")
    .update({
      last_message_at: now,
      last_message_preview: preview,
    })
    .eq("id", input.targetConversationId);
  if (convErr) throw convErr;

  if (input.sentMessage) {
    messageCache.set(input.waMessageId, input.sentMessage);
  }

  console.log(
    JSON.stringify({
      event: "message_op_forward_crm_saved",
      targetConversationId: input.targetConversationId,
      waMessageId: input.waMessageId,
      inserted,
      hasMedia: Boolean(input.sourceRow.media_bucket_path),
    }),
  );
}

export async function drainMessageOps(
  sock: WASocket,
  supabase: SupabaseClient,
  messageCache: MessageCache,
) {
  await reclaimOrphanMessageOps(supabase);
  const rows = await claimMessageOps(supabase, 5);

  for (const row of rows) {
    try {
      const msgRow = await fetchMessageRow(supabase, row.message_id);
      if (!msgRow) {
        await markMessageOpFailed(supabase, row.id, "missing_wa_message_id");
        continue;
      }

      const sourceJid = await resolveConversationJid(
        supabase,
        row.source_conversation_id,
      );
      if (!sourceJid) {
        await markMessageOpFailed(supabase, row.id, "missing_source_wa_chat_id");
        continue;
      }

      const chatJid = await resolveQuoteChatJid(
        supabase,
        row.source_conversation_id,
        sourceJid,
      );
      const waMessage = await buildWaMessageFromDb(
        supabase,
        msgRow,
        chatJid,
        messageCache,
      );

      if (row.op === "forward") {
        if (!row.target_conversation_id) {
          await markMessageOpFailed(supabase, row.id, "missing_target_conversation");
          continue;
        }
        const targetJid = await resolveConversationJid(
          supabase,
          row.target_conversation_id,
        );
        if (!targetJid) {
          await markMessageOpFailed(supabase, row.id, "missing_target_wa_chat_id");
          continue;
        }
        const sent = await sock.sendMessage(targetJid, { forward: waMessage });
        const newWaId = sent?.key?.id;
        if (!newWaId) {
          throw new Error("forward_missing_wa_message_id");
        }
        await persistForwardedMessage(supabase, messageCache, {
          sourceRow: msgRow,
          targetConversationId: row.target_conversation_id,
          waMessageId: newWaId,
          sentMessage: sent?.message ?? undefined,
        });
        console.log(
          JSON.stringify({
            event: "message_op_forward_done",
            messageId: row.message_id,
            targetJid,
            newWaId,
          }),
        );
      } else if (row.op === "delete_for_everyone") {
        if (msgRow.direction !== "out") {
          await markMessageOpFailed(
            supabase,
            row.id,
            "delete_for_everyone_not_outbound",
          );
          continue;
        }
        await sock.sendMessage(chatJid, { delete: waMessage.key });
        await markMessageDeleted(supabase, { messageId: row.message_id });
        console.log(
          JSON.stringify({
            event: "message_op_delete_everyone_done",
            messageId: row.message_id,
          }),
        );
      } else {
        await sock.chatModify(
          {
            delete: true,
            lastMessages: [
              {
                key: waMessage.key,
                messageTimestamp: Number(waTimestamp(msgRow.created_at)),
              },
            ],
          },
          chatJid,
        );
        await removeMessageFromCrm(supabase, row.message_id);
        console.log(
          JSON.stringify({
            event: "message_op_delete_me_done",
            messageId: row.message_id,
          }),
        );
      }

      await markMessageOpDone(supabase, row.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("message_op_failed", msg);
      if (row.attempts >= 2) {
        await markMessageOpFailed(supabase, row.id, msg);
      } else {
        await requeueMessageOp(supabase, row.id, msg);
      }
    }
  }
}
