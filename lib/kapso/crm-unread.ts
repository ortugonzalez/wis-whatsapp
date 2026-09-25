import type { SupabaseClient } from "@supabase/supabase-js";
import { isWaUnreadLabelName } from "@/lib/inbox/team-read";

const KAPSO_UNREAD_WA_ID = "kapso:unread";

/**
 * Ensure sector has CRM projection label «No leídos» (Kapso has no WA Business labels).
 * Returns label id or null.
 */
export async function ensureKapsoUnreadLabelId(
  supabase: SupabaseClient,
  sectorId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("labels")
    .select("id, name")
    .eq("sector_id", sectorId);

  const found = (existing ?? []).find((l) =>
    isWaUnreadLabelName(l.name as string),
  );
  if (found?.id) return found.id as string;

  const { data: created, error } = await supabase
    .from("labels")
    .insert({
      sector_id: sectorId,
      wa_label_id: KAPSO_UNREAD_WA_ID,
      name: "No leídos",
      color: "0",
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    // Race: another writer inserted the same name.
    const { data: raced } = await supabase
      .from("labels")
      .select("id, name")
      .eq("sector_id", sectorId);
    const again = (raced ?? []).find((l) =>
      isWaUnreadLabelName(l.name as string),
    );
    return (again?.id as string | undefined) ?? null;
  }

  return created.id as string;
}

/** CRM cache only — never enqueue whatsapp_label_ops (Kapso has no Baileys worker). */
export async function setKapsoCrmUnreadLabel(
  supabase: SupabaseClient,
  sectorId: string,
  conversationId: string,
  unread: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const labelId = await ensureKapsoUnreadLabelId(supabase, sectorId);
  if (!labelId) {
    return { ok: false, error: "No se pudo crear la etiqueta No leídos." };
  }

  if (unread) {
    const { error } = await supabase.from("conversation_labels").upsert(
      {
        conversation_id: conversationId,
        label_id: labelId,
      },
      { onConflict: "conversation_id,label_id" },
    );
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("conversation_labels")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("label_id", labelId);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * Loop guard: after CRM→Kapso markRead, skip Kapso→CRM reconcile briefly
 * (status already "read"; CRM attribution should stay via=crm).
 */
const recentCrmKapsoRead = new Map<string, number>();
const CRM_KAPSO_READ_SUPPRESS_MS = 60_000;

export function noteKapsoCrmMarkRead(conversationId: string): void {
  recentCrmKapsoRead.set(conversationId, Date.now());
}

export function shouldSkipKapsoReconcileEcho(conversationId: string): boolean {
  const at = recentCrmKapsoRead.get(conversationId);
  if (at == null) return false;
  if (Date.now() - at > CRM_KAPSO_READ_SUPPRESS_MS) {
    recentCrmKapsoRead.delete(conversationId);
    return false;
  }
  return true;
}

/** Pure decision for selfcheck / reconcile. */
export function kapsoInboundStatusMeansRead(
  status: string | null | undefined,
): boolean {
  return status === "read";
}
