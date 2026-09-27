"use server";

import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type MessageActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function requireConnectedChannel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sectorId: string,
): Promise<
  | { ok: true; sectorId: string }
  | { ok: false; error: string }
> {
  const connection = await fetchConnectionBySectorId(supabase, sectorId);

  if (connection?.status !== "connected") {
    return { ok: false, error: "Canal WhatsApp desconectado." };
  }
  return { ok: true, sectorId: connection.sector_id };
}

async function loadMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  messageId: string,
  conversationId: string,
  sectorId: string,
) {
  const { data: message } = await supabase
    .from("messages")
    .select("id, conversation_id, wa_message_id, direction")
    .eq("id", messageId)
    .eq("sector_id", sectorId)
    .maybeSingle();

  if (!message || message.conversation_id !== conversationId) {
    return { ok: false as const, error: "Mensaje no encontrado." };
  }
  if (!message.wa_message_id) {
    return {
      ok: false as const,
      error: "Mensaje aún no sincronizado con WhatsApp.",
    };
  }
  return { ok: true as const, message };
}

export async function forwardMessage(input: {
  messageId: string;
  sourceConversationId: string;
  targetConversationId: string;
}): Promise<MessageActionResult> {
  if (process.env.WIS_OUTBOUND_ENABLED !== "true") return {ok:false,error:"Operaciones de WhatsApp pausadas."};
  const { sector } = await requireActiveSector();
  const supabase = await createClient();

  const channel = await requireConnectedChannel(supabase, sector.id);
  if (!channel.ok) return channel;

  if (input.sourceConversationId === input.targetConversationId) {
    return { ok: false, error: "Elegí un chat distinto al actual." };
  }

  const loaded = await loadMessage(
    supabase,
    input.messageId,
    input.sourceConversationId,
    channel.sectorId,
  );
  if (!loaded.ok) return loaded;

  const { data: target } = await supabase
    .from("conversations")
    .select("id, wa_chat_id, sector_id")
    .eq("id", input.targetConversationId)
    .eq("sector_id", channel.sectorId)
    .maybeSingle();
  if (!target?.wa_chat_id) {
    return { ok: false, error: "Chat destino inválido." };
  }

  const { data: source } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", input.sourceConversationId)
    .eq("sector_id", channel.sectorId)
    .maybeSingle();
  if (!source) {
    return { ok: false, error: "Chat origen inválido." };
  }

  const { error: opErr } = await supabase.from("whatsapp_message_ops").insert({
    sector_id: channel.sectorId,
    message_id: input.messageId,
    source_conversation_id: input.sourceConversationId,
    target_conversation_id: input.targetConversationId,
    op: "forward",
    status: "pending",
  });

  if (opErr) return { ok: false, error: opErr.message };

  revalidatePath(`/c/${input.sourceConversationId}`);
  revalidatePath(`/c/${input.targetConversationId}`);
  return { ok: true };
}

export async function deleteMessageForMe(input: {
  messageId: string;
  conversationId: string;
}): Promise<MessageActionResult> {
  if (process.env.WIS_OUTBOUND_ENABLED !== "true") return {ok:false,error:"Operaciones de WhatsApp pausadas."};
  const { sector } = await requireActiveSector();
  const supabase = await createClient();

  const channel = await requireConnectedChannel(supabase, sector.id);
  if (!channel.ok) return channel;

  const loaded = await loadMessage(
    supabase,
    input.messageId,
    input.conversationId,
    channel.sectorId,
  );
  if (!loaded.ok) return loaded;

  const { error: opErr } = await supabase.from("whatsapp_message_ops").insert({
    sector_id: channel.sectorId,
    message_id: input.messageId,
    source_conversation_id: input.conversationId,
    op: "delete_for_me",
    status: "pending",
  });

  if (opErr) return { ok: false, error: opErr.message };

  revalidatePath(`/c/${input.conversationId}`);
  return { ok: true };
}

export async function deleteMessageForEveryone(input: {
  messageId: string;
  conversationId: string;
}): Promise<MessageActionResult> {
  if (process.env.WIS_OUTBOUND_ENABLED !== "true") return {ok:false,error:"Operaciones de WhatsApp pausadas."};
  const { sector } = await requireActiveSector();
  const supabase = await createClient();

  const channel = await requireConnectedChannel(supabase, sector.id);
  if (!channel.ok) return channel;

  const loaded = await loadMessage(
    supabase,
    input.messageId,
    input.conversationId,
    channel.sectorId,
  );
  if (!loaded.ok) return loaded;

  if (loaded.message.direction !== "out") {
    return {
      ok: false,
      error: "Solo podés eliminar para todos tus propios mensajes.",
    };
  }

  const { error: opErr } = await supabase.from("whatsapp_message_ops").insert({
    sector_id: channel.sectorId,
    message_id: input.messageId,
    source_conversation_id: input.conversationId,
    op: "delete_for_everyone",
    status: "pending",
  });

  if (opErr) return { ok: false, error: opErr.message };

  revalidatePath(`/c/${input.conversationId}`);
  return { ok: true };
}
