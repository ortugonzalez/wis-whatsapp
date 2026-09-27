import { assertOutboundAllowed } from "./safety.js";
import type { WAMessage, WAMessageKey, WASocket } from "baileys";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  lastMessagesForChatModify,
  mapChatReadRows,
  unreadInboundKeys,
  type ChatReadLastMessage,
} from "./chat-read-keys.js";
import {
  expectNativeReadEcho,
  expectNativeUnreadEcho,
} from "./native-unread-suppress.js";
import { resolveWorkerSectorId } from "./sector.js";

export type ChatReadOpRow = {
  id: string;
  conversation_id: string;
  op: "read" | "unread";
  status: string;
  attempts: number;
  created_at?: string;
};

function toWaLast(msg: ChatReadLastMessage): WAMessage {
  return {
    key: msg.key as WAMessageKey,
    messageTimestamp: msg.messageTimestamp,
  };
}

async function loadChatReadPayload(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{
  chatJid: string;
  lastMessages: ChatReadLastMessage[];
  unreadKeys: WAMessageKey[];
} | null> {
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("wa_chat_id, contact_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) throw convErr;
  const chatJid = (conv?.wa_chat_id as string | null)?.trim();
  if (!chatJid) return null;

  let pnJid: string | null = null;
  const contactId = conv?.contact_id as string | null;
  if (contactId) {
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("wa_jid")
      .eq("id", contactId)
      .maybeSingle();
    if (contactErr) throw contactErr;
    pnJid = (contact?.wa_jid as string | null)?.trim() || null;
  }

  const { data: rows, error } = await supabase
    .from("messages")
    .select("wa_message_id, direction, wa_sender_jid, created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;

  const newestFirst = mapChatReadRows(rows ?? [], chatJid, pnJid);
  return {
    chatJid,
    lastMessages: lastMessagesForChatModify(newestFirst),
    unreadKeys: unreadInboundKeys(newestFirst) as WAMessageKey[],
  };
}

export async function claimChatReadOps(
  supabase: SupabaseClient,
  limit = 8,
): Promise<ChatReadOpRow[]> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: pending, error } = await supabase
    .from("whatsapp_chat_read_ops")
    .select("id, conversation_id, op, status, attempts, created_at")
    .eq("sector_id", sectorId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!pending?.length) return [];

  const latestByConv = new Map<string, (typeof pending)[number]>();
  for (const row of pending) {
    latestByConv.set(row.conversation_id as string, row);
  }

  const claimed: ChatReadOpRow[] = [];
  for (const row of pending) {
    const keep = latestByConv.get(row.conversation_id as string);
    if (keep && keep.id !== row.id) {
      await supabase
        .from("whatsapp_chat_read_ops")
        .update({ status: "done", last_error: "superseded_by_later_op" })
        .eq("id", row.id)
        .eq("status", "pending");
      continue;
    }

    const { data, error: upErr } = await supabase
      .from("whatsapp_chat_read_ops")
      .update({
        status: "sending",
        attempts: (row.attempts as number) + 1,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id, conversation_id, op, status, attempts, created_at")
      .maybeSingle();
    if (upErr) throw upErr;
    if (data) claimed.push(data as ChatReadOpRow);
  }
  return claimed;
}

async function markOpDone(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from("whatsapp_chat_read_ops")
    .update({ status: "done", last_error: null })
    .eq("id", id);
  if (error) throw error;
}

async function markOpFailed(
  supabase: SupabaseClient,
  id: string,
  lastError: string,
) {
  const { error } = await supabase
    .from("whatsapp_chat_read_ops")
    .update({ status: "failed", last_error: lastError.slice(0, 500) })
    .eq("id", id);
  if (error) throw error;
}

async function requeueOp(
  supabase: SupabaseClient,
  id: string,
  lastError: string,
) {
  const { error } = await supabase
    .from("whatsapp_chat_read_ops")
    .update({
      status: "pending",
      last_error: lastError.slice(0, 500),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function reclaimOrphanChatReadOps(supabase: SupabaseClient) {
  const sectorId = await resolveWorkerSectorId(supabase);
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("whatsapp_chat_read_ops")
    .update({ status: "pending", last_error: "reclaimed_orphan_sending" })
    .eq("sector_id", sectorId)
    .eq("status", "sending")
    .lt("updated_at", cutoff);
  if (error) throw error;
}

export async function drainChatReadOps(
  sock: WASocket,
  supabase: SupabaseClient,
) {
  await reclaimOrphanChatReadOps(supabase);
  const rows = await claimChatReadOps(supabase, 8);
  for (const row of rows) {
    try {
      const payload = await loadChatReadPayload(supabase, row.conversation_id);
      if (!payload) {
        await markOpFailed(supabase, row.id, "missing_wa_chat_id");
        continue;
      }
      const { chatJid, lastMessages, unreadKeys } = payload;
      const last = lastMessages[lastMessages.length - 1];
      if (!last?.key?.id) {
        await markOpFailed(supabase, row.id, "missing_last_message");
        continue;
      }

      const waLastMessages = lastMessages.map(toWaLast);

      if (row.op === "read") {
        // Evolution: readMessages (receipts). Baileys docs: also chatModify
        // for inbox bold. Dual keys (LID + PN) because aggregateMessageKeys
        // ignores remoteJidAlt and only sends to remoteJid.
        const receiptKeys: WAMessageKey[] = [...unreadKeys];
        const pnAlt = last.key.remoteJidAlt;
        if (pnAlt && pnAlt !== chatJid) {
          for (const key of unreadKeys) {
            receiptKeys.push({
              ...key,
              remoteJid: pnAlt,
              remoteJidAlt: chatJid,
            });
          }
        }
        if (receiptKeys.length) {
          await assertOutboundAllowed(supabase);
          await sock.readMessages(receiptKeys);
        }
        await assertOutboundAllowed(supabase);
        await sock.chatModify(
          { markRead: true, lastMessages: waLastMessages },
          chatJid,
        );
        expectNativeReadEcho(row.conversation_id);
      } else {
        await assertOutboundAllowed(supabase);
        await sock.chatModify(
          { markRead: false, lastMessages: waLastMessages },
          chatJid,
        );
        expectNativeUnreadEcho(row.conversation_id);
      }

      await markOpDone(supabase, row.id);
      console.log(
        JSON.stringify({
          event: "chat_read_op_done",
          op: row.op,
          conversationId: row.conversation_id,
          chatId: chatJid,
          lastFromMe: last.key.fromMe,
          lastId: last.key.id,
          range: lastMessages.length,
          receipts: unreadKeys.length,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("chat_read_op_failed");
      if (row.attempts >= 2) {
        await markOpFailed(supabase, row.id, msg);
      } else {
        await requeueOp(supabase, row.id, msg);
      }
    }
  }
}
