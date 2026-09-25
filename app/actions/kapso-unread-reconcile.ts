"use server";

import {
  kapsoInboundStatusMeansRead,
  setKapsoCrmUnreadLabel,
  shouldSkipKapsoReconcileEcho,
} from "@/lib/kapso/crm-unread";
import { getKapsoMessageStatus } from "@/lib/kapso/get-message";
import { KAPSO_SECTOR_SLUG } from "@/lib/kapso/ingest-message";
import { isWaUnreadLabelName } from "@/lib/inbox/team-read";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type KapsoUnreadReconcileResult =
  | { ok: true; cleared: number }
  | { ok: false; error: string };

/**
 * B→A: Kapso native inbox marked inbound as read (status=read) → clear CRM unread.
 * Source of truth for this path: Kapso inbound kapso.status.
 * Skips conversations we just marked from CRM (loop guard).
 */
export async function reconcileKapsoUnreadFromPlatform(): Promise<KapsoUnreadReconcileResult> {
  const { sector } = await requireActiveSector();
  if (sector.channel_provider !== "kapso" || sector.slug !== KAPSO_SECTOR_SLUG) {
    return { ok: true, cleared: 0 };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: labels } = await supabase
    .from("labels")
    .select("id, name")
    .eq("sector_id", sector.id);
  const unreadLabel = (labels ?? []).find((l) =>
    isWaUnreadLabelName(l.name as string),
  );
  if (!unreadLabel?.id) {
    return { ok: true, cleared: 0 };
  }

  const { data: links } = await supabase
    .from("conversation_labels")
    .select("conversation_id")
    .eq("label_id", unreadLabel.id);

  const conversationIds = [
    ...new Set(
      (links ?? [])
        .map((r) => r.conversation_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (conversationIds.length === 0) {
    return { ok: true, cleared: 0 };
  }

  // Defense in depth: only conversations of the active Kapso sector.
  const { data: scoped } = await supabase
    .from("conversations")
    .select("id")
    .eq("sector_id", sector.id)
    .in("id", conversationIds);

  const scopedIds = (scoped ?? [])
    .map((r) => r.id as string)
    .filter(Boolean);

  // hermes:ceiling poll last inbound ≤40 chats on focus → webhook if Kapso adds unread event
  const capped = scopedIds.slice(0, 40);
  let cleared = 0;

  for (const conversationId of capped) {
    if (shouldSkipKapsoReconcileEcho(conversationId)) continue;

    const { data: lastIn } = await supabase
      .from("messages")
      .select("wa_message_id")
      .eq("conversation_id", conversationId)
      .eq("sector_id", sector.id)
      .eq("direction", "in")
      .is("deleted_at", null)
      .not("wa_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const wamid = lastIn?.wa_message_id as string | null | undefined;
    if (!wamid) continue;

    const status = await getKapsoMessageStatus(wamid);
    if (!status.ok) continue;
    if (!kapsoInboundStatusMeansRead(status.status)) continue;

    // Service-role RPC: attribution «Leído desde el teléfono» (preserve CRM via if already crm).
    const { error: rpcErr } = await admin.rpc(
      "mark_conversation_read_from_whatsapp",
      { p_conversation_id: conversationId },
    );
    if (rpcErr) {
      console.error("kapso_reconcile_read_rpc_failed", rpcErr.message);
      continue;
    }

    const labelResult = await setKapsoCrmUnreadLabel(
      admin,
      sector.id,
      conversationId,
      false,
    );
    if (!labelResult.ok) {
      console.error("kapso_reconcile_label_failed", labelResult.error);
      continue;
    }

    cleared += 1;
  }

  if (cleared > 0) {
    revalidatePath("/");
  }

  return { ok: true, cleared };
}
