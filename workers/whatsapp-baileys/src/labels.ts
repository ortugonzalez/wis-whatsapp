import { jidNormalizedUser, type WASocket } from "baileys";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  shouldIgnoreNativeUnreadEcho,
  shouldIgnoreNativeReadEcho,
} from "./native-unread-suppress.js";
import { resolveWorkerSectorId } from "./sector.js";

export type WaLabel = {
  id: string;
  name: string;
  color: number;
  deleted: boolean;
  predefinedId?: string;
};

export async function upsertWaLabel(
  supabase: SupabaseClient,
  label: WaLabel,
) {
  const sectorId = await resolveWorkerSectorId(supabase);
  if (label.deleted) {
    const { error } = await supabase
      .from("labels")
      .delete()
      .eq("sector_id", sectorId)
      .eq("wa_label_id", label.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("labels").upsert(
    {
      sector_id: sectorId,
      wa_label_id: label.id,
      name: label.name,
      color: String(label.color),
      attrs: {
        predefinedId: label.predefinedId ?? null,
        placeholder: false,
      },
    },
    { onConflict: "sector_id,wa_label_id" },
  );
  if (error) throw error;
}

async function ensureLabelRow(
  supabase: SupabaseClient,
  waLabelId: string,
): Promise<string> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: existing, error } = await supabase
    .from("labels")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("wa_label_id", waLabelId)
    .maybeSingle();
  if (error) throw error;
  if (existing?.id) return existing.id;

  // Insert-only: never upsert a placeholder over a real name from labels.edit.
  const { data: created, error: createErr } = await supabase
    .from("labels")
    .insert({
      sector_id: sectorId,
      wa_label_id: waLabelId,
      name: `Label ${waLabelId}`,
      color: null,
      attrs: { placeholder: true },
    })
    .select("id")
    .single();
  if (createErr) {
    if (createErr.code === "23505") {
      const { data: raced, error: raceErr } = await supabase
        .from("labels")
        .select("id")
        .eq("sector_id", sectorId)
        .eq("wa_label_id", waLabelId)
        .maybeSingle();
      if (raceErr) throw raceErr;
      if (raced?.id) return raced.id;
    }
    throw createErr;
  }
  return created.id;
}

function isUnreadLabelName(name: string): boolean {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .includes("NO LEID");
}

async function findUnreadLabelUuid(
  supabase: SupabaseClient,
): Promise<{ id: string; wa_label_id: string } | null> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data, error } = await supabase
    .from("labels")
    .select("id, wa_label_id, name")
    .eq("sector_id", sectorId);
  if (error) throw error;
  const hit = (data ?? []).find((l) => isUnreadLabelName((l.name as string) ?? ""));
  if (!hit?.id || !hit.wa_label_id) return null;
  return { id: hit.id as string, wa_label_id: hit.wa_label_id as string };
}

/**
 * CRM cache for WA «No leídos». Native phone unread (unreadCount / inbound)
 * does NOT always emit labels.association for label 14 — we mirror it here.
 */
export async function setCrmWaUnreadLabel(
  supabase: SupabaseClient,
  conversationId: string,
  unread: boolean,
  reason: string,
  opts?: { writeBackWa?: boolean },
): Promise<void> {
  const unreadLabel = await findUnreadLabelUuid(supabase);
  if (!unreadLabel) {
    console.log(
      JSON.stringify({
        event: "team_read_wa_sync_skip",
        reason: "no_unread_label",
        conversationId,
        source: reason,
      }),
    );
    return;
  }

  const { data: existingLink, error: linkErr } = await supabase
    .from("conversation_labels")
    .select("label_id")
    .eq("conversation_id", conversationId)
    .eq("label_id", unreadLabel.id)
    .maybeSingle();
  if (linkErr) throw linkErr;
  const hasLabel = Boolean(existingLink);

  if (unread && !hasLabel) {
    const { error } = await supabase.from("conversation_labels").upsert(
      {
        conversation_id: conversationId,
        label_id: unreadLabel.id,
      },
      { onConflict: "conversation_id,label_id" },
    );
    if (error) throw error;
  } else if (!unread && hasLabel) {
    const { error } = await supabase
      .from("conversation_labels")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("label_id", unreadLabel.id);
    if (error) throw error;
  }

  const { error: syncErr } = await supabase.rpc(
    unread
      ? "mark_conversation_unread_from_whatsapp"
      : "mark_conversation_read_from_whatsapp",
    { p_conversation_id: conversationId },
  );
  if (syncErr) {
    console.log(
      JSON.stringify({
        event: "team_read_wa_sync_fail",
        type: unread ? "add" : "remove",
        conversationId,
        error: syncErr.message,
        source: reason,
      }),
    );
  }

  if (opts?.writeBackWa && unread !== hasLabel) {
    await enqueueUnreadLabelWriteBack(
      supabase,
      conversationId,
      unreadLabel.wa_label_id,
      unread ? "add" : "remove",
    );
  }

  console.log(
    JSON.stringify({
      event: "team_read_wa_sync",
      type: unread ? "add" : "remove",
      conversationId,
      source: reason,
      cacheChanged: unread !== hasLabel,
    }),
  );
}

/** Interpret Baileys chat.unreadCount → CRM unread, or null to leave CRM unchanged.
 *  >0 = unread with badge count
 *  0 = read
 *  null = live mark-read (Baileys initial-sync uses null instead of 0)
 *  -1 = app-state "mark unread" sentinel — unreliable on linked devices (false positives);
 *      ignore here; manual unread is covered by label 14 / CRM chat_unread_op / inbound.
 */
export function interpretNativeUnreadCount(
  unreadCount: number | null,
): boolean | null {
  if (unreadCount === null) return false;
  if (unreadCount > 0) return true;
  if (unreadCount === 0) return false;
  return null;
}

export function isNativeUnreadBackfillSource(source: string | undefined): boolean {
  const s = source ?? "";
  return s.startsWith("chats.upsert") || s === "history";
}

export function shouldHonorNativeReadZero(input: {
  source?: string;
  trustReadZero?: boolean;
}): boolean {
  if (input.trustReadZero) return true;
  return !isNativeUnreadBackfillSource(input.source);
}

export function decideNativeUnreadSync(input: {
  unreadCount: number | null | undefined;
  source?: string;
  trustReadZero?: boolean;
}): "unread" | "read" | "skip" {
  if (input.unreadCount === undefined) return "skip";
  if (typeof input.unreadCount === "number" && input.unreadCount < 0) {
    return "skip";
  }
  const unread = interpretNativeUnreadCount(input.unreadCount);
  if (unread === null) return "skip";
  if (!unread && !shouldHonorNativeReadZero(input)) return "skip";
  return unread ? "unread" : "read";
}

async function enqueueUnreadLabelWriteBack(
  supabase: SupabaseClient,
  conversationId: string,
  waLabelId: string,
  op: "add" | "remove",
): Promise<void> {
  const writeEnv = process.env.WHATSAPP_LABELS_WRITE;
  if (writeEnv === "0" || writeEnv === "false") return;

  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: conn, error: connErr } = await supabase
    .from("whatsapp_connections")
    .select("labels_write_enabled, status")
    .eq("sector_id", sectorId)
    .maybeSingle();
  if (connErr) throw connErr;
  if (!conn || conn.labels_write_enabled === false || conn.status !== "connected") {
    return;
  }

  const { data: existing, error: existErr } = await supabase
    .from("whatsapp_label_ops")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("conversation_id", conversationId)
    .eq("wa_label_id", waLabelId)
    .eq("op", op)
    .in("status", ["pending", "sending"])
    .limit(1);
  if (existErr) {
    console.log(
      JSON.stringify({
        event: "team_read_wa_writeback_fail",
        conversationId,
        op,
        error: existErr.message,
      }),
    );
    return;
  }
  if (existing?.length) return;

  const { error } = await supabase.from("whatsapp_label_ops").insert({
    sector_id: sectorId,
    conversation_id: conversationId,
    wa_label_id: waLabelId,
    op,
    status: "pending",
  });
  if (error) {
    console.log(
      JSON.stringify({
        event: "team_read_wa_writeback_fail",
        conversationId,
        op,
        error: error.message,
      }),
    );
    return;
  }
  console.log(
    JSON.stringify({
      event: "team_read_wa_writeback",
      conversationId,
      op,
      waLabelId,
    }),
  );
}

export async function findConversationIdByChatJid(
  supabase: SupabaseClient,
  chatId: string,
): Promise<string | null> {
  const jid = jidNormalizedUser(chatId);
  if (!jid) return null;

  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: byChat, error: chatErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("wa_chat_id", jid)
    .maybeSingle();
  if (chatErr) throw chatErr;
  if (byChat?.id) return byChat.id as string;

  const { data: byLid, error: lidErr } = await supabase
    .from("contacts")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("wa_lid", jid)
    .maybeSingle();
  if (lidErr) throw lidErr;

  const { data: byPn, error: pnErr } = await supabase
    .from("contacts")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("wa_jid", jid)
    .maybeSingle();
  if (pnErr) throw pnErr;

  const contactId = (byLid?.id as string | undefined) ?? (byPn?.id as string | undefined);
  if (!contactId) return null;

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("contact_id", contactId)
    .eq("kind", "direct")
    .maybeSingle();
  if (convErr) throw convErr;
  return (conv?.id as string | undefined) ?? null;
}

/** Sync CRM unread label from Baileys chat.unreadCount (native inbox unread). */
export async function syncNativeChatUnread(
  supabase: SupabaseClient,
  input: {
    chatId: string;
    unreadCount: number | null | undefined;
    source?: string;
    trustReadZero?: boolean;
  },
): Promise<void> {
  const decision = decideNativeUnreadSync({
    unreadCount: input.unreadCount,
    source: input.source,
    trustReadZero: input.trustReadZero,
  });
  if (decision === "skip") {
    if (typeof input.unreadCount === "number" && input.unreadCount < 0) {
      console.log(
        JSON.stringify({
          event: "team_read_wa_sync_skip",
          reason: "unread_count_sentinel",
          chatId: input.chatId,
          unreadCount: input.unreadCount,
          source: input.source ?? "chats.update",
        }),
      );
    }
    return;
  }

  const conversationId = await findConversationIdByChatJid(
    supabase,
    input.chatId,
  );
  if (!conversationId) {
    console.log(
      JSON.stringify({
        event: "team_read_wa_sync_skip",
        reason: "unknown_chat",
        chatId: input.chatId,
        unreadCount: input.unreadCount,
        source: input.source ?? "chats.update",
      }),
    );
    return;
  }

  const unread = decision === "unread";

  if (unread && shouldIgnoreNativeUnreadEcho(conversationId)) {
    console.log(
      JSON.stringify({
        event: "team_read_wa_sync_skip",
        reason: "crm_read_suppress",
        conversationId,
        unreadCount: input.unreadCount,
      }),
    );
    return;
  }

  if (!unread && shouldIgnoreNativeReadEcho(conversationId)) {
    console.log(
      JSON.stringify({
        event: "team_read_wa_sync_skip",
        reason: "crm_unread_suppress",
        conversationId,
        unreadCount: input.unreadCount,
      }),
    );
    return;
  }

  await setCrmWaUnreadLabel(
    supabase,
    conversationId,
    unread,
    `${input.source ?? "chats.update"}:${String(input.unreadCount)}`,
    { writeBackWa: true },
  );
}

export async function applyChatLabelAssociation(
  supabase: SupabaseClient,
  input: {
    type: "add" | "remove";
    chatId: string;
    labelId: string;
  },
) {
  const labelUuid = await ensureLabelRow(supabase, input.labelId);

  const conversationId = await findConversationIdByChatJid(
    supabase,
    input.chatId,
  );
  if (!conversationId) {
    console.log(
      JSON.stringify({
        event: "label_assoc_skip",
        reason: "unknown_chat",
        chatId: input.chatId,
        labelId: input.labelId,
      }),
    );
    return;
  }

  if (input.type === "add") {
    const { error } = await supabase.from("conversation_labels").upsert(
      {
        conversation_id: conversationId,
        label_id: labelUuid,
      },
      { onConflict: "conversation_id,label_id" },
    );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("conversation_labels")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("label_id", labelUuid);
    if (error) throw error;
  }

  const { data: labelRow } = await supabase
    .from("labels")
    .select("name")
    .eq("id", labelUuid)
    .maybeSingle();
  const name = (labelRow?.name as string | undefined) ?? "";
  if (isUnreadLabelName(name)) {
    const { error: syncErr } = await supabase.rpc(
      input.type === "add"
        ? "mark_conversation_unread_from_whatsapp"
        : "mark_conversation_read_from_whatsapp",
      { p_conversation_id: conversationId },
    );
    if (syncErr) {
      console.log(
        JSON.stringify({
          event: "team_read_wa_sync_fail",
          type: input.type,
          conversationId,
          error: syncErr.message,
        }),
      );
    }
  }
}

export type LabelOpRow = {
  id: string;
  conversation_id: string;
  wa_label_id: string;
  op: "add" | "remove";
  status: string;
  attempts: number;
};

export async function claimLabelOps(
  supabase: SupabaseClient,
  limit = 5,
): Promise<LabelOpRow[]> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: pending, error } = await supabase
    .from("whatsapp_label_ops")
    .select("id, conversation_id, wa_label_id, op, status, attempts")
    .eq("sector_id", sectorId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!pending?.length) return [];

  const claimed: LabelOpRow[] = [];
  for (const row of pending) {
    const { data, error: updErr } = await supabase
      .from("whatsapp_label_ops")
      .update({
        status: "sending",
        attempts: (row.attempts ?? 0) + 1,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id, conversation_id, wa_label_id, op, status, attempts")
      .maybeSingle();
    if (updErr) throw updErr;
    if (data) claimed.push(data as LabelOpRow);
  }
  return claimed;
}

export async function markLabelOpDone(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from("whatsapp_label_ops")
    .update({ status: "done", last_error: null })
    .eq("id", id);
  if (error) throw error;
}

export async function markLabelOpFailed(
  supabase: SupabaseClient,
  id: string,
  lastError: string,
) {
  const { error } = await supabase
    .from("whatsapp_label_ops")
    .update({ status: "failed", last_error: lastError.slice(0, 500) })
    .eq("id", id);
  if (error) throw error;
}

async function requeueLabelOp(
  supabase: SupabaseClient,
  id: string,
  lastError: string,
) {
  const { error } = await supabase
    .from("whatsapp_label_ops")
    .update({
      status: "pending",
      last_error: lastError.slice(0, 500),
    })
    .eq("id", id);
  if (error) throw error;
}

/** Undo panel optimistic cache when WA write finally fails (WA is source of truth). */
async function revertConversationLabelCache(
  supabase: SupabaseClient,
  row: LabelOpRow,
) {
  const labelUuid = await ensureLabelRow(supabase, row.wa_label_id);
  if (row.op === "add") {
    const { error } = await supabase
      .from("conversation_labels")
      .delete()
      .eq("conversation_id", row.conversation_id)
      .eq("label_id", labelUuid);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("conversation_labels").upsert(
      {
        conversation_id: row.conversation_id,
        label_id: labelUuid,
      },
      { onConflict: "conversation_id,label_id" },
    );
    if (error) throw error;
  }

  const { data: labelRow } = await supabase
    .from("labels")
    .select("name")
    .eq("id", labelUuid)
    .maybeSingle();
  const name = (labelRow?.name as string | undefined) ?? "";
  if (!isUnreadLabelName(name)) return;

  // Keep team_read cursor aligned with the restored WA unread label state.
  const { error: syncErr } = await supabase.rpc(
    row.op === "add"
      ? "mark_conversation_read_from_whatsapp"
      : "mark_conversation_unread_from_whatsapp",
    { p_conversation_id: row.conversation_id },
  );
  if (syncErr) {
    console.log(
      JSON.stringify({
        event: "team_read_wa_sync_fail",
        type: row.op === "add" ? "remove" : "add",
        conversationId: row.conversation_id,
        error: syncErr.message,
        reason: "label_op_revert",
      }),
    );
  }
}

export async function reclaimOrphanLabelOps(supabase: SupabaseClient) {
  const sectorId = await resolveWorkerSectorId(supabase);
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("whatsapp_label_ops")
    .update({ status: "pending", last_error: "reclaimed_orphan_sending" })
    .eq("sector_id", sectorId)
    .eq("status", "sending")
    .lt("updated_at", cutoff);
  if (error) throw error;
}

export async function setLabelsWriteEnabled(
  supabase: SupabaseClient,
  enabled: boolean,
) {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { error } = await supabase
    .from("whatsapp_connections")
    .update({ labels_write_enabled: enabled })
    .eq("sector_id", sectorId);
  if (error) throw error;
}

export async function drainLabelOps(
  sock: WASocket,
  supabase: SupabaseClient,
) {
  const writeEnv = process.env.WHATSAPP_LABELS_WRITE;
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: conn } = await supabase
    .from("whatsapp_connections")
    .select("labels_write_enabled")
    .eq("sector_id", sectorId)
    .maybeSingle();

  if (writeEnv === "0" || writeEnv === "false") {
    // Sync kill-switch to DB so the panel also goes read-only.
    if (conn && conn.labels_write_enabled !== false) {
      await setLabelsWriteEnabled(supabase, false);
    }
    return;
  }

  if (conn && conn.labels_write_enabled === false) return;

  await reclaimOrphanLabelOps(supabase);
  const rows = await claimLabelOps(supabase, 5);
  for (const row of rows) {
    try {
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .select("wa_chat_id")
        .eq("id", row.conversation_id)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv?.wa_chat_id) {
        await markLabelOpFailed(supabase, row.id, "missing_wa_chat_id");
        await revertConversationLabelCache(supabase, row);
        continue;
      }

      if (row.op === "add") {
        await sock.addChatLabel(conv.wa_chat_id, row.wa_label_id);
      } else {
        await sock.removeChatLabel(conv.wa_chat_id, row.wa_label_id);
      }
      await markLabelOpDone(supabase, row.id);
      console.log(
        JSON.stringify({
          event: "label_op_done",
          op: row.op,
          waLabelId: row.wa_label_id,
          chatId: conv.wa_chat_id,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("label_op_failed", msg);
      // attempts already incremented at claim; failed→pending was missing so
      // attempts>=2 never fired — requeue once, then fail + degrade.
      if (row.attempts >= 2) {
        await markLabelOpFailed(supabase, row.id, msg);
        try {
          await revertConversationLabelCache(supabase, row);
        } catch (revertErr) {
          console.error("label_op_revert_failed", revertErr);
        }
        await setLabelsWriteEnabled(supabase, false);
        console.log(
          JSON.stringify({
            event: "labels_write_disabled",
            reason: msg,
          }),
        );
      } else {
        await requeueLabelOp(supabase, row.id, msg);
      }
    }
  }
}

type CatalogOpRow = {
  id: string;
  label_id: string;
  wa_label_id: string;
  name: string;
  color: number;
  op: string;
  status: string;
  attempts: number;
};

export async function claimLabelCatalogOps(
  supabase: SupabaseClient,
  limit = 5,
): Promise<CatalogOpRow[]> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: pending, error } = await supabase
    .from("whatsapp_label_catalog_ops")
    .select("id, label_id, wa_label_id, name, color, op, status, attempts")
    .eq("sector_id", sectorId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!pending?.length) return [];

  const claimed: CatalogOpRow[] = [];
  for (const row of pending) {
    const { data, error: updErr } = await supabase
      .from("whatsapp_label_catalog_ops")
      .update({
        status: "sending",
        attempts: (row.attempts ?? 0) + 1,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id, label_id, wa_label_id, name, color, op, status, attempts")
      .maybeSingle();
    if (updErr) throw updErr;
    if (data) claimed.push(data as CatalogOpRow);
  }
  return claimed;
}

async function markCatalogOpDone(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from("whatsapp_label_catalog_ops")
    .update({ status: "done", last_error: null })
    .eq("id", id);
  if (error) throw error;
}

async function markCatalogOpFailed(
  supabase: SupabaseClient,
  id: string,
  lastError: string,
) {
  const { error } = await supabase
    .from("whatsapp_label_catalog_ops")
    .update({ status: "failed", last_error: lastError.slice(0, 500) })
    .eq("id", id);
  if (error) throw error;
}

async function requeueCatalogOp(
  supabase: SupabaseClient,
  id: string,
  lastError: string,
) {
  const { error } = await supabase
    .from("whatsapp_label_catalog_ops")
    .update({
      status: "pending",
      last_error: lastError.slice(0, 500),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function reclaimOrphanCatalogOps(supabase: SupabaseClient) {
  const sectorId = await resolveWorkerSectorId(supabase);
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("whatsapp_label_catalog_ops")
    .update({ status: "pending", last_error: "reclaimed_orphan_sending" })
    .eq("sector_id", sectorId)
    .eq("status", "sending")
    .lt("updated_at", cutoff);
  if (error) throw error;
}

/**
 * Create Business label catalog entries (Baileys `addLabel` / labelEditAction).
 * Does not flip labels_write_enabled on failure (chat assign path owns that).
 */
export async function drainLabelCatalogOps(
  sock: WASocket,
  supabase: SupabaseClient,
) {
  const writeEnv = process.env.WHATSAPP_LABELS_WRITE;
  if (writeEnv === "0" || writeEnv === "false") return;

  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: conn } = await supabase
    .from("whatsapp_connections")
    .select("labels_write_enabled, status")
    .eq("sector_id", sectorId)
    .maybeSingle();
  if (!conn || conn.labels_write_enabled === false || conn.status !== "connected") {
    return;
  }

  const meJid = sock.user?.id;
  if (!meJid) {
    console.log(JSON.stringify({ event: "label_catalog_skip", reason: "no_user_jid" }));
    return;
  }

  await reclaimOrphanCatalogOps(supabase);
  const rows = await claimLabelCatalogOps(supabase, 5);
  for (const row of rows) {
    try {
      if (row.op !== "create") {
        await markCatalogOpFailed(supabase, row.id, `unsupported_op:${row.op}`);
        continue;
      }
      await sock.addLabel(meJid, {
        id: row.wa_label_id,
        name: row.name,
        color: row.color,
      });

      const { data: existing, error: attrsErr } = await supabase
        .from("labels")
        .select("attrs")
        .eq("id", row.label_id)
        .maybeSingle();
      if (attrsErr) throw attrsErr;
      const prevAttrs =
        existing?.attrs && typeof existing.attrs === "object"
          ? (existing.attrs as Record<string, unknown>)
          : {};
      const { error: labelUpdErr } = await supabase
        .from("labels")
        .update({
          name: row.name,
          color: String(row.color),
          attrs: {
            ...prevAttrs,
            crm_create_pending: false,
            crm_create_failed: false,
            source: prevAttrs.source ?? "cobranzas",
          },
        })
        .eq("id", row.label_id);
      if (labelUpdErr) throw labelUpdErr;

      await markCatalogOpDone(supabase, row.id);
      console.log(
        JSON.stringify({
          event: "label_catalog_create_done",
          labelId: row.label_id,
          waLabelId: row.wa_label_id,
          name: row.name,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("label_catalog_create_failed", msg);
      if (row.attempts >= 2) {
        await markCatalogOpFailed(supabase, row.id, msg);
        const { data: existingFail, error: failAttrsErr } = await supabase
          .from("labels")
          .select("attrs")
          .eq("id", row.label_id)
          .maybeSingle();
        if (failAttrsErr) {
          console.error("label_catalog_attrs_read_failed", failAttrsErr.message);
        } else {
          const failAttrs =
            existingFail?.attrs && typeof existingFail.attrs === "object"
              ? (existingFail.attrs as Record<string, unknown>)
              : {};
          const { error: failUpdErr } = await supabase
            .from("labels")
            .update({
              attrs: {
                ...failAttrs,
                crm_create_pending: false,
                crm_create_failed: true,
                crm_create_error: msg.slice(0, 200),
              },
            })
            .eq("id", row.label_id);
          if (failUpdErr) {
            console.error("label_catalog_attrs_update_failed", failUpdErr.message);
          }
        }
        console.log(
          JSON.stringify({
            event: "label_catalog_create_exhausted",
            labelId: row.label_id,
            error: msg,
          }),
        );
      } else {
        await requeueCatalogOp(supabase, row.id, msg);
      }
    }
  }
}

/**
 * After outbox marked sent: link conversation_labels + enqueue WA add (idempotent).
 * Failures are logged only — caller must not revert sent.
 */
export async function assignCrmLabelAfterSent(
  supabase: SupabaseClient,
  row: {
    id: string;
    conversation_id: string | null;
    crm_label_id?: string | null;
  },
): Promise<void> {
  const labelId = row.crm_label_id ?? null;
  const conversationId = row.conversation_id;
  if (!labelId || !conversationId) return;

  try {
    const sectorId = await resolveWorkerSectorId(supabase);
    const { data: label, error: labelErr } = await supabase
      .from("labels")
      .select("id, wa_label_id, sector_id")
      .eq("id", labelId)
      .maybeSingle();
    if (labelErr) throw labelErr;
    if (!label?.wa_label_id) {
      console.log(
        JSON.stringify({
          event: "crm_label_assign_skip",
          outboxId: row.id,
          reason: "label_missing",
          labelId,
        }),
      );
      return;
    }
    if (label.sector_id !== sectorId) {
      console.log(
        JSON.stringify({
          event: "crm_label_assign_skip",
          outboxId: row.id,
          reason: "sector_mismatch",
          labelId,
        }),
      );
      return;
    }

    const { error: linkErr } = await supabase.from("conversation_labels").upsert(
      {
        conversation_id: conversationId,
        label_id: label.id,
      },
      { onConflict: "conversation_id,label_id" },
    );
    if (linkErr) throw linkErr;

    const { data: existingOps, error: existErr } = await supabase
      .from("whatsapp_label_ops")
      .select("id")
      .eq("sector_id", sectorId)
      .eq("conversation_id", conversationId)
      .eq("wa_label_id", label.wa_label_id)
      .eq("op", "add")
      .in("status", ["pending", "sending", "done"])
      .limit(1);
    if (existErr) throw existErr;
    if (!existingOps?.length) {
      const { error: opErr } = await supabase.from("whatsapp_label_ops").insert({
        sector_id: sectorId,
        conversation_id: conversationId,
        wa_label_id: label.wa_label_id,
        op: "add",
        status: "pending",
      });
      if (opErr) throw opErr;
    }

    console.log(
      JSON.stringify({
        event: "crm_label_assign_queued",
        outboxId: row.id,
        conversationId,
        labelId,
        waLabelId: label.wa_label_id,
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(
      JSON.stringify({
        event: "crm_label_assign_fail",
        outboxId: row.id,
        labelId,
        conversationId,
        error: msg,
      }),
    );
  }
}

export async function handleLabelsEdit(
  supabase: SupabaseClient,
  label: WaLabel,
) {
  await upsertWaLabel(supabase, label);
  console.log(
    JSON.stringify({
      event: "labels_edit",
      id: label.id,
      name: label.name,
      deleted: label.deleted,
    }),
  );
}

export async function handleLabelsAssociation(
  supabase: SupabaseClient,
  payload: {
    type: "add" | "remove";
    association: {
      type: string;
      chatId: string;
      labelId: string;
      messageId?: string;
    };
  },
) {
  // Chat associations use LabelAssociationType.Chat === "label_jid".
  // Ignore message-level labels in v1.
  if (payload.association.type !== "label_jid") return;

  await applyChatLabelAssociation(supabase, {
    type: payload.type,
    chatId: payload.association.chatId,
    labelId: payload.association.labelId,
  });
  console.log(
    JSON.stringify({
      event: "labels_association",
      type: payload.type,
      chatId: payload.association.chatId,
      labelId: payload.association.labelId,
    }),
  );
}
