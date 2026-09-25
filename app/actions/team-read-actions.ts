"use server";

import {
  noteKapsoCrmMarkRead,
  setKapsoCrmUnreadLabel,
} from "@/lib/kapso/crm-unread";
import { markKapsoMessageRead } from "@/lib/kapso/mark-read";
import { resolveKapsoPhoneNumberId } from "@/lib/kapso/send-text";
import { isWaUnreadLabelName } from "@/lib/inbox/team-read";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type TeamReadActionResult =
  | { ok: true }
  | { ok: false; error: string };

const RECENT_UNREAD_HOLD_MS = 45_000;

async function latestChatReadOp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
): Promise<{ op: string; created_at: string } | null> {
  const { data } = await supabase
    .from("whatsapp_chat_read_ops")
    .select("op, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.op || !data.created_at) return null;
  return { op: data.op as string, created_at: data.created_at as string };
}

function isRecentUnreadHold(
  latest: { op: string; created_at: string } | null,
): boolean {
  if (latest?.op !== "unread") return false;
  const age = Date.now() - new Date(latest.created_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < RECENT_UNREAD_HOLD_MS;
}

async function enqueueNativeChatReadOp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sectorId: string,
  conversationId: string,
  op: "read" | "unread",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const connection = await fetchConnectionBySectorId(supabase, sectorId);

  if (connection?.status !== "connected") {
    return { ok: true };
  }

  const { error } = await supabase.from("whatsapp_chat_read_ops").insert({
    sector_id: connection.sector_id,
    conversation_id: conversationId,
    op,
    status: "pending",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function syncWaUnreadLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sectorId: string,
  conversationId: string,
  assign: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const connection = await fetchConnectionBySectorId(supabase, sectorId);
  if (!connection?.sector_id) {
    // CRM cache-only path needs a sector to avoid cross-sector label rows.
    return { ok: true };
  }

  const { data: labels } = await supabase
    .from("labels")
    .select("id, wa_label_id, name")
    .eq("sector_id", sectorId);
  const unread = (labels ?? []).find((l) =>
    isWaUnreadLabelName(l.name as string),
  );
  if (!unread) {
    return { ok: true };
  }

  const { data: link } = await supabase
    .from("conversation_labels")
    .select("label_id")
    .eq("conversation_id", conversationId)
    .eq("label_id", unread.id)
    .maybeSingle();

  const hasLabel = Boolean(link);

  // Always update CRM cache so UI matches; queue WA op when channel allows.
  if (assign) {
    const { error } = await supabase.from("conversation_labels").upsert(
      {
        conversation_id: conversationId,
        label_id: unread.id,
      },
      { onConflict: "conversation_id,label_id" },
    );
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("conversation_labels")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("label_id", unread.id);
    if (error) return { ok: false, error: error.message };
  }

  // Always enqueue when connected so WA gets the write even if CRM cache
  // already matched (e.g. repair left label only in DB).
  if (
    connection &&
    connection.labels_write_enabled !== false &&
    connection.status === "connected"
  ) {
    const { error: opErr } = await supabase.from("whatsapp_label_ops").insert({
      sector_id: connection.sector_id,
      conversation_id: conversationId,
      wa_label_id: unread.wa_label_id,
      op: assign ? "add" : "remove",
      status: "pending",
    });
    if (opErr) {
      // Roll back cache if we couldn't queue the WA op and we changed it.
      if (assign !== hasLabel) {
        if (assign) {
          await supabase
            .from("conversation_labels")
            .delete()
            .eq("conversation_id", conversationId)
            .eq("label_id", unread.id);
        } else {
          await supabase.from("conversation_labels").upsert(
            {
              conversation_id: conversationId,
              label_id: unread.id,
            },
            { onConflict: "conversation_id,label_id" },
          );
        }
      }
      return { ok: false, error: opErr.message };
    }
  }

  return { ok: true };
}

export async function markConversationRead(
  conversationId: string,
): Promise<TeamReadActionResult> {
  const { sector } = await requireActiveSector();
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("sector_id", sector.id)
    .maybeSingle();
  if (!conv) {
    return { ok: false, error: "Conversación no encontrada." };
  }

  // Thread remount/auto-read must not undo a just-clicked «Marcar no leído».
  const latest = await latestChatReadOp(supabase, conversationId);
  if (isRecentUnreadHold(latest)) {
    return { ok: true };
  }

  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  if (sector.channel_provider === "kapso") {
    // A→B Kapso: CRM projection + Meta markRead (native Kapso inbox).
    // Source of truth this path: CRM open/mark-read. Do not enqueue Baileys ops.
    const labelResult = await setKapsoCrmUnreadLabel(
      supabase,
      sector.id,
      conversationId,
      false,
    );
    if (!labelResult.ok) return labelResult;

    const connection = await fetchConnectionBySectorId(supabase, sector.id);
    const phoneNumberId = resolveKapsoPhoneNumberId(
      connection?.kapso_phone_number_id,
    );
    if (phoneNumberId) {
      const { data: lastIn } = await supabase
        .from("messages")
        .select("wa_message_id")
        .eq("conversation_id", conversationId)
        .eq("direction", "in")
        .is("deleted_at", null)
        .not("wa_message_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const wamid = lastIn?.wa_message_id as string | null | undefined;
      if (wamid) {
        noteKapsoCrmMarkRead(conversationId);
        const marked = await markKapsoMessageRead({
          phoneNumberId,
          messageId: wamid,
        });
        if (!marked.ok) {
          // Keep CRM + Kapso inbox aligned: restore projection if Meta markRead fails.
          await setKapsoCrmUnreadLabel(
            supabase,
            sector.id,
            conversationId,
            true,
          );
          return {
            ok: false,
            error:
              marked.error ||
              "No se pudo marcar leído en Kapso. Reintentá abrir el chat.",
          };
        }
      }
    }

    revalidatePath("/");
    revalidatePath(`/c/${conversationId}`);
    return { ok: true };
  }

  const labelResult = await syncWaUnreadLabel(
    supabase,
    sector.id,
    conversationId,
    false,
  );
  if (!labelResult.ok) {
    return labelResult;
  }

  // Native inbox unread (phone bold/count) — not the Business label alone.
  const native = await enqueueNativeChatReadOp(
    supabase,
    sector.id,
    conversationId,
    "read",
  );
  if (!native.ok) {
    return native;
  }

  revalidatePath("/");
  revalidatePath(`/c/${conversationId}`);
  return { ok: true };
}

export async function markConversationUnread(
  conversationId: string,
): Promise<TeamReadActionResult> {
  const { sector } = await requireActiveSector();
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("sector_id", sector.id)
    .maybeSingle();
  if (!conv) {
    return { ok: false, error: "Conversación no encontrada." };
  }

  const { error } = await supabase.rpc("mark_conversation_unread", {
    p_conversation_id: conversationId,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  if (sector.channel_provider === "kapso") {
    // Kapso/Meta has no mark-unread API — CRM projection only (ADR 004 label).
    const labelResult = await setKapsoCrmUnreadLabel(
      supabase,
      sector.id,
      conversationId,
      true,
    );
    if (!labelResult.ok) return labelResult;

    // Hold marker for auto mark-read on remount (same as Baileys chat_read_ops).
    // status=done: no Baileys worker for this sector; only latestChatReadOp timing.
    const connection = await fetchConnectionBySectorId(supabase, sector.id);
    if (connection?.sector_id) {
      await supabase.from("whatsapp_chat_read_ops").insert({
        sector_id: connection.sector_id,
        conversation_id: conversationId,
        op: "unread",
        status: "done",
      });
    }

    revalidatePath("/");
    revalidatePath(`/c/${conversationId}`);
    return { ok: true };
  }

  const labelResult = await syncWaUnreadLabel(
    supabase,
    sector.id,
    conversationId,
    true,
  );
  if (!labelResult.ok) {
    return labelResult;
  }

  const native = await enqueueNativeChatReadOp(
    supabase,
    sector.id,
    conversationId,
    "unread",
  );
  if (!native.ok) {
    return native;
  }

  revalidatePath("/");
  revalidatePath(`/c/${conversationId}`);
  return { ok: true };
}
