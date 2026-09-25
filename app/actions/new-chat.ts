"use server";

import { revalidatePath } from "next/cache";
import { sendOutboundMessage } from "@/app/actions/send-message";
import { computeDisplayName } from "@/lib/contacts/display-name";
import { e164ToWaChatId, normalizeArE164 } from "@/lib/phone/ar-e164";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { createClient } from "@/lib/supabase/server";

export type StartNewChatResult =
  | { ok: true; conversationId: string; messageId: string }
  | { ok: false; error: string };

/**
 * Start or reopen a 1:1 chat by Argentine E.164 and enqueue the first text.
 * Worker resolves the real JID via onWhatsApp on send; not-on-WA cleans orphan rows
 * (agents cannot DELETE contacts/conversations under RLS — see docs/whatsapp-baileys.md).
 */
export async function startNewChat(input: {
  phone: string;
  body: string;
}): Promise<StartNewChatResult> {
  const { sector } = await requireActiveSector();
  const supabase = await createClient();

  const e164 = normalizeArE164(input.phone);
  if (!e164) {
    return {
      ok: false,
      error:
        "Número inválido. Usá un celular argentino (ej. 3469… o +54 9 3469…).",
    };
  }

  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: "Escribí el primer mensaje." };
  }

  const connection = await fetchConnectionBySectorId(supabase, sector.id);

  if (!connection || connection.status !== "connected") {
    return {
      ok: false,
      error:
        "El canal WhatsApp no está conectado. Pedile al admin que lo vincule.",
    };
  }

  const sectorId = connection.sector_id;
  const waChatId = e164ToWaChatId(e164);
  const displayName = computeDisplayName({ phone_e164: e164 });

  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("phone_e164", e164)
    .maybeSingle();

  let contactId = existingContact?.id as string | undefined;

  if (!contactId) {
    const { data: created, error } = await supabase
      .from("contacts")
      .insert({
        sector_id: sectorId,
        phone_e164: e164,
        wa_jid: waChatId,
        push_name: "",
        agenda_name: "",
        verified_name: "",
        display_name: displayName,
      })
      .select("id")
      .single();

    if (error || !created) {
      const { data: raced } = await supabase
        .from("contacts")
        .select("id")
        .eq("sector_id", sectorId)
        .eq("phone_e164", e164)
        .maybeSingle();
      if (!raced?.id) {
        return {
          ok: false,
          error: "No se pudo crear el contacto. Probá de nuevo.",
        };
      }
      contactId = raced.id as string;
    } else {
      contactId = created.id as string;
    }
  }

  const { data: byChat } = await supabase
    .from("conversations")
    .select("id")
    .eq("sector_id", sectorId)
    .eq("wa_chat_id", waChatId)
    .maybeSingle();

  let conversationId = byChat?.id as string | undefined;

  if (!conversationId) {
    const { data: byContact } = await supabase
      .from("conversations")
      .select("id")
      .eq("sector_id", sectorId)
      .eq("contact_id", contactId)
      .limit(1)
      .maybeSingle();
    conversationId = byContact?.id as string | undefined;
  }

  if (!conversationId) {
    const { data: createdConv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        sector_id: sectorId,
        contact_id: contactId,
        wa_chat_id: waChatId,
        kind: "direct",
        last_message_at: null,
        last_message_preview: null,
      })
      .select("id")
      .single();

    if (convErr || !createdConv) {
      const { data: raced } = await supabase
        .from("conversations")
        .select("id")
        .eq("sector_id", sectorId)
        .eq("wa_chat_id", waChatId)
        .maybeSingle();
      if (!raced?.id) {
        return {
          ok: false,
          error: "No se pudo crear la conversación. Probá de nuevo.",
        };
      }
      conversationId = raced.id as string;
    } else {
      conversationId = createdConv.id as string;
    }
  }

  const send = await sendOutboundMessage({
    conversationId,
    type: "text",
    body,
  });

  if (!send.ok) {
    return { ok: false, error: send.error };
  }

  revalidatePath("/");
  revalidatePath(`/c/${conversationId}`);
  return { ok: true, conversationId, messageId: send.messageId };
}
