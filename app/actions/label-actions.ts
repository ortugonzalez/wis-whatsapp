"use server";

import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isWaUnreadLabelName } from "@/lib/inbox/team-read";
import { revalidatePath } from "next/cache";

export type LabelActionResult =
  | { ok: true }
  | { ok: false; error: string; readOnly?: boolean };

export type SectorLabelRow = {
  id: string;
  wa_label_id: string;
  name: string;
  color: string | null;
};

export type ConversationLabelsPanel =
  | {
      ok: true;
      writeEnabled: boolean;
      labels: SectorLabelRow[];
      assignedIds: string[];
    }
  | { ok: false; error: string };

export type CreateSectorLabelResult =
  | { ok: true; label: SectorLabelRow }
  | { ok: false; error: string; readOnly?: boolean };

export async function toggleConversationLabel(input: {
  conversationId: string;
  labelId: string;
  waLabelId: string;
  assign: boolean;
}): Promise<LabelActionResult> {
  const { sector } = await requireActiveSector();
  const supabase = await createClient();

  const connection = await fetchConnectionBySectorId(supabase, sector.id);

  if (connection?.labels_write_enabled === false) {
    return {
      ok: false,
      error:
        "Escritura de etiquetas deshabilitada (Baileys inestable). Solo lectura/filtro.",
      readOnly: true,
    };
  }

  if (connection?.status !== "connected") {
    return { ok: false, error: "Canal WhatsApp desconectado." };
  }

  const sectorId = connection.sector_id;

  const { data: label } = await supabase
    .from("labels")
    .select("id, wa_label_id")
    .eq("id", input.labelId)
    .eq("sector_id", sectorId)
    .maybeSingle();
  if (!label || label.wa_label_id !== input.waLabelId) {
    return { ok: false, error: "Etiqueta inválida." };
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", input.conversationId)
    .eq("sector_id", sectorId)
    .maybeSingle();
  if (!conv) {
    return { ok: false, error: "Conversación no encontrada." };
  }

  if (input.assign) {
    const { error: linkErr } = await supabase
      .from("conversation_labels")
      .upsert(
        {
          conversation_id: input.conversationId,
          label_id: input.labelId,
        },
        { onConflict: "conversation_id,label_id" },
      );
    if (linkErr) {
      return { ok: false, error: linkErr.message };
    }
  } else {
    const { error: delErr } = await supabase
      .from("conversation_labels")
      .delete()
      .eq("conversation_id", input.conversationId)
      .eq("label_id", input.labelId);
    if (delErr) {
      return { ok: false, error: delErr.message };
    }
  }

  const { error: opErr } = await supabase.from("whatsapp_label_ops").insert({
    sector_id: sectorId,
    conversation_id: input.conversationId,
    wa_label_id: input.waLabelId,
    op: input.assign ? "add" : "remove",
    status: "pending",
  });

  if (opErr) {
    // Roll back optimistic cache — WA never got a queued op.
    if (input.assign) {
      await supabase
        .from("conversation_labels")
        .delete()
        .eq("conversation_id", input.conversationId)
        .eq("label_id", input.labelId);
    } else {
      await supabase.from("conversation_labels").upsert(
        {
          conversation_id: input.conversationId,
          label_id: input.labelId,
        },
        { onConflict: "conversation_id,label_id" },
      );
    }
    return { ok: false, error: opErr.message };
  }

  revalidatePath("/");
  revalidatePath(`/c/${input.conversationId}`);
  return { ok: true };
}

/** Labels + assignment for the ⋮ Agregar a lista panel (excludes «No leídos»). */
export async function loadConversationLabelsPanel(
  conversationId: string,
): Promise<ConversationLabelsPanel> {
  const { sector } = await requireActiveSector();
  const supabase = await createClient();

  const connection = await fetchConnectionBySectorId(supabase, sector.id);
  const writeEnabled =
    connection?.labels_write_enabled !== false &&
    connection?.status === "connected";

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("sector_id", sector.id)
    .maybeSingle();
  if (!conv) {
    return { ok: false, error: "Conversación no encontrada." };
  }

  const [{ data: labels, error: labelsErr }, { data: links, error: linksErr }] =
    await Promise.all([
      supabase
        .from("labels")
        .select("id, wa_label_id, name, color")
        .eq("sector_id", sector.id)
        .order("name", { ascending: true }),
      supabase
        .from("conversation_labels")
        .select("label_id")
        .eq("conversation_id", conversationId),
    ]);

  if (labelsErr) return { ok: false, error: labelsErr.message };
  if (linksErr) return { ok: false, error: linksErr.message };

  const filtered = (labels ?? [])
    .filter((l) => !isWaUnreadLabelName(String(l.name ?? "")))
    .map((l) => ({
      id: l.id as string,
      wa_label_id: l.wa_label_id as string,
      name: l.name as string,
      color: (l.color as string | null) ?? null,
    }));

  return {
    ok: true,
    writeEnabled,
    labels: filtered,
    assignedIds: (links ?? []).map((l) => l.label_id as string),
  };
}

/**
 * Authenticated create: membership via requireActiveSector, then S26 RPC
 * via service_role (catalog_ops has no authenticated grants).
 */
export async function createSectorLabel(
  name: string,
): Promise<CreateSectorLabelResult> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) {
    return { ok: false, error: "Nombre inválido." };
  }
  if (isWaUnreadLabelName(trimmed)) {
    return {
      ok: false,
      error: "Ese nombre está reservado para el sistema.",
    };
  }

  const { sector } = await requireActiveSector();
  const supabase = await createClient();
  const connection = await fetchConnectionBySectorId(supabase, sector.id);

  if (connection?.labels_write_enabled === false) {
    return {
      ok: false,
      error:
        "Escritura de etiquetas deshabilitada (Baileys inestable). Solo lectura/filtro.",
      readOnly: true,
    };
  }

  if (connection?.status !== "connected") {
    return { ok: false, error: "Canal WhatsApp desconectado." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_sector_label", {
    p_sector_slug: sector.slug,
    p_name: trimmed,
    p_color: null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) {
    return { ok: false, error: "No se pudo crear la lista." };
  }

  const { data: full, error: fetchErr } = await supabase
    .from("labels")
    .select("id, wa_label_id, name, color")
    .eq("id", row.id as string)
    .eq("sector_id", sector.id)
    .maybeSingle();

  if (fetchErr || !full) {
    return {
      ok: false,
      error: fetchErr?.message ?? "Lista creada pero no se pudo leer.",
    };
  }

  revalidatePath("/");
  return {
    ok: true,
    label: {
      id: full.id as string,
      wa_label_id: full.wa_label_id as string,
      name: full.name as string,
      color: (full.color as string | null) ?? null,
    },
  };
}
