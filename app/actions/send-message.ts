"use server";

import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  resolveKapsoPhoneNumberId,
  sendKapsoText,
} from "@/lib/kapso/send-text";
import { isWithinKapsoServiceWindow } from "@/lib/kapso/window-24h";
import {
  WHATSAPP_MEDIA_BUCKET,
  type MessageType,
} from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_TYPES = new Set<MessageType>([
  "text",
  "image",
  "audio",
  "document",
]);

export type SendMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

function previewFor(type: MessageType, body: string | null): string {
  if (type === "text") return (body ?? "").slice(0, 120);
  if (type === "image") return "Imagen";
  if (type === "audio") return "Audio";
  return "Documento";
}

function quotePreview(type: MessageType, body: string | null): string {
  const label = previewFor(type, body);
  return label.slice(0, 160);
}

export async function sendOutboundMessage(input: {
  conversationId: string;
  type: MessageType;
  body?: string;
  mediaBucketPath?: string | null;
  /** CRM message id to reply to (same conversation). */
  quotedMessageId?: string | null;
}): Promise<SendMessageResult> {
  const { profile, sector } = await requireActiveSector();
  const supabase = await createClient();

  if (!ALLOWED_TYPES.has(input.type)) {
    return { ok: false, error: "Tipo de mensaje no soportado." };
  }

  const body = (input.body ?? "").trim();
  if (input.type === "text" && !body) {
    return { ok: false, error: "Escribí un mensaje." };
  }
  if (input.type !== "text" && !input.mediaBucketPath) {
    return { ok: false, error: "Falta el archivo adjunto." };
  }

  if (sector.channel_provider === "kapso") {
    return sendKapsoOutboundMessage({
      supabase,
      profileId: profile.id,
      sectorId: sector.id,
      input,
      body,
    });
  }

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select(
      "id, sector_id, kind, wa_chat_id, contact_id, contacts(phone_e164, display_name, push_name)",
    )
    .eq("id", input.conversationId)
    .eq("sector_id", sector.id)
    .maybeSingle();

  if (convErr || !conversation) {
    return { ok: false, error: "Conversación no encontrada." };
  }

  const kind = (conversation.kind as string | null) ?? "direct";
  const waChatId = conversation.wa_chat_id as string;
  const sectorId = conversation.sector_id as string;
  const contact = Array.isArray(conversation.contacts)
    ? conversation.contacts[0]
    : conversation.contacts;
  const toE164 = (contact as { phone_e164?: string | null } | null)?.phone_e164;

  if (kind === "group") {
    if (!waChatId || !waChatId.endsWith("@g.us")) {
      return { ok: false, error: "El grupo no tiene JID válido." };
    }
  } else if (!toE164) {
    return {
      ok: false,
      error: "El contacto no tiene teléfono E.164; no se puede enviar.",
    };
  }

  let quotedMessageId: string | null = null;
  let quotedWaMessageId: string | null = null;
  let quotedBodyPreview: string | null = null;

  if (input.quotedMessageId) {
    const { data: quoted, error: qErr } = await supabase
      .from("messages")
      .select("id, conversation_id, wa_message_id, type, body")
      .eq("id", input.quotedMessageId)
      .eq("sector_id", sector.id)
      .maybeSingle();

    if (qErr || !quoted) {
      return { ok: false, error: "El mensaje a citar no existe." };
    }
    if (quoted.conversation_id !== input.conversationId) {
      return {
        ok: false,
        error: "Solo se puede citar un mensaje del mismo chat.",
      };
    }
    if (!quoted.wa_message_id) {
      return {
        ok: false,
        error:
          "Ese mensaje todavía no tiene id de WhatsApp; esperá a que se envíe y reintentá.",
      };
    }
    quotedMessageId = quoted.id as string;
    quotedWaMessageId = quoted.wa_message_id as string;
    quotedBodyPreview = quotePreview(
      quoted.type as MessageType,
      (quoted.body as string | null) ?? null,
    );
  }

  const connection = await fetchConnectionBySectorId(supabase, sector.id);

  if (!connection || connection.status !== "connected") {
    return {
      ok: false,
      error: "El canal WhatsApp no está conectado. Pedile al admin que lo vincule.",
    };
  }

  if (connection.sector_id !== sectorId) {
    return { ok: false, error: "La conversación no pertenece al sector activo." };
  }

  const preview = previewFor(input.type, body || null);
  const now = new Date().toISOString();

  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .insert({
      sector_id: sectorId,
      conversation_id: input.conversationId,
      direction: "out",
      type: input.type,
      body: input.type === "text" ? body : body || null,
      media_bucket_path: input.mediaBucketPath ?? null,
      sent_by: profile.id,
      delivery_status: "pending",
      source: "live",
      quoted_message_id: quotedMessageId,
      quoted_wa_message_id: quotedWaMessageId,
      quoted_body_preview: quotedBodyPreview,
    })
    .select("id")
    .single();

  if (msgErr || !message) {
    return {
      ok: false,
      error: msgErr?.message ?? "No se pudo crear el mensaje.",
    };
  }

  const outboxPayload = {
    sector_id: sectorId,
    to_e164: kind === "group" ? null : (toE164 as string),
    to_jid: kind === "group" ? waChatId : null,
    conversation_id: input.conversationId,
    message_id: message.id,
    type: input.type,
    body: input.type === "text" ? body : body || null,
    media_bucket_path: input.mediaBucketPath ?? null,
    quoted_wa_message_id: quotedWaMessageId,
    sent_by: profile.id,
    status: "pending",
  };

  const { error: outboxErr } = await supabase
    .from("whatsapp_outbox")
    .insert(outboxPayload);

  if (outboxErr) {
    const { error: delErr } = await supabase
      .from("messages")
      .delete()
      .eq("id", message.id);
    if (delErr) {
      return {
        ok: false,
        error: `No se pudo encolar el envío y quedó un mensaje pendiente huérfano: ${outboxErr.message}`,
      };
    }
    return {
      ok: false,
      error: outboxErr.message ?? "No se pudo encolar el envío.",
    };
  }

  await supabase
    .from("conversations")
    .update({
      last_message_at: now,
      last_message_preview: preview,
    })
    .eq("id", input.conversationId)
    .eq("sector_id", sector.id);

  // No revalidatePath: Realtime already updates thread + inbox. Revalidating
  // remounts the Composer and steals focus after each send.
  return { ok: true, messageId: message.id };
}

/** Re-enqueue a failed outbound message (same CRM row) for the worker to drain. */
export async function retryOutboundMessage(input: {
  conversationId: string;
  messageId: string;
}): Promise<SendMessageResult> {
  const { profile, sector } = await requireActiveSector();
  const supabase = await createClient();

  if (sector.channel_provider === "kapso") {
    return {
      ok: false,
      error:
        "En Kapso reintentá enviando de nuevo desde el composer (sin cola Baileys).",
    };
  }

  const connection = await fetchConnectionBySectorId(supabase, sector.id);
  if (!connection || connection.status !== "connected") {
    return {
      ok: false,
      error: "El canal WhatsApp no está conectado. Pedile al admin que lo vincule.",
    };
  }

  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, sector_id, direction, type, body, media_bucket_path, delivery_status, quoted_wa_message_id, deleted_at",
    )
    .eq("id", input.messageId)
    .eq("sector_id", sector.id)
    .maybeSingle();

  if (msgErr || !message) {
    return { ok: false, error: "Mensaje no encontrado." };
  }
  if (message.conversation_id !== input.conversationId) {
    return { ok: false, error: "El mensaje no pertenece a este chat." };
  }
  if (message.direction !== "out") {
    return { ok: false, error: "Solo se pueden reintentar mensajes salientes." };
  }
  if (message.deleted_at) {
    return { ok: false, error: "El mensaje fue eliminado." };
  }
  if (message.delivery_status !== "failed") {
    return { ok: false, error: "Ese mensaje no está en estado fallido." };
  }
  if (!ALLOWED_TYPES.has(message.type as MessageType)) {
    return { ok: false, error: "Tipo de mensaje no soportado." };
  }
  if (message.type === "text" && !(message.body ?? "").trim()) {
    return { ok: false, error: "El mensaje no tiene texto para reenviar." };
  }
  if (message.type !== "text" && !message.media_bucket_path) {
    return { ok: false, error: "Falta el archivo adjunto del mensaje." };
  }

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select(
      "id, sector_id, kind, wa_chat_id, contacts(phone_e164)",
    )
    .eq("id", input.conversationId)
    .eq("sector_id", sector.id)
    .maybeSingle();

  if (convErr || !conversation) {
    return { ok: false, error: "Conversación no encontrada." };
  }

  const kind = (conversation.kind as string | null) ?? "direct";
  const waChatId = conversation.wa_chat_id as string;
  const contact = Array.isArray(conversation.contacts)
    ? conversation.contacts[0]
    : conversation.contacts;
  const toE164 = (contact as { phone_e164?: string | null } | null)?.phone_e164;

  if (kind === "group") {
    if (!waChatId || !waChatId.endsWith("@g.us")) {
      return { ok: false, error: "El grupo no tiene JID válido." };
    }
  } else if (!toE164) {
    return {
      ok: false,
      error: "El contacto no tiene teléfono E.164; no se puede enviar.",
    };
  }

  const { error: outboxErr } = await supabase.from("whatsapp_outbox").insert({
    sector_id: sector.id,
    to_e164: kind === "group" ? null : (toE164 as string),
    to_jid: kind === "group" ? waChatId : null,
    conversation_id: input.conversationId,
    message_id: message.id,
    type: message.type,
    body: message.type === "text" ? message.body : message.body || null,
    media_bucket_path: message.media_bucket_path ?? null,
    quoted_wa_message_id: message.quoted_wa_message_id ?? null,
    sent_by: profile.id,
    status: "pending",
  });

  if (outboxErr) {
    return {
      ok: false,
      error: outboxErr.message ?? "No se pudo reencolar el envío.",
    };
  }

  return { ok: true, messageId: message.id };
}

async function sendKapsoOutboundMessage(opts: {
  supabase: SupabaseClient;
  profileId: string;
  sectorId: string;
  body: string;
  input: {
    conversationId: string;
    type: MessageType;
    body?: string;
    mediaBucketPath?: string | null;
    quotedMessageId?: string | null;
  };
}): Promise<SendMessageResult> {
  const { supabase, profileId, sectorId, input, body } = opts;

  if (input.type !== "text") {
    return {
      ok: false,
      error: "En Kapso por ahora solo texto (media en un slice siguiente).",
    };
  }

  let connection;
  try {
    connection = await fetchConnectionBySectorId(supabase, sectorId);
  } catch {
    return {
      ok: false,
      error: "No se pudo leer la conexión del canal.",
    };
  }
  const phoneNumberId = resolveKapsoPhoneNumberId(
    connection?.kapso_phone_number_id,
  );
  if (!phoneNumberId) {
    return {
      ok: false,
      error:
        "Falta KAPSO_PHONE_NUMBER_ID (env o connection). Configurá el canal Kapso.",
    };
  }

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select("id, sector_id, kind, contacts(phone_e164)")
    .eq("id", input.conversationId)
    .eq("sector_id", sectorId)
    .maybeSingle();

  if (convErr || !conversation) {
    return { ok: false, error: "Conversación no encontrada." };
  }
  if (((conversation.kind as string | null) ?? "direct") === "group") {
    return { ok: false, error: "Kapso no atiende grupos en este CRM." };
  }

  const contact = Array.isArray(conversation.contacts)
    ? conversation.contacts[0]
    : conversation.contacts;
  const toE164 = (contact as { phone_e164?: string | null } | null)?.phone_e164;
  if (!toE164) {
    return {
      ok: false,
      error: "El contacto no tiene teléfono E.164; no se puede enviar.",
    };
  }

  const window = await isWithinKapsoServiceWindow(supabase, {
    sectorId,
    conversationId: input.conversationId,
  });
  if (!window.ok) {
    return { ok: false, error: window.error };
  }
  if (!window.open) {
    return {
      ok: false,
      error:
        "Fuera de la ventana de 24 h de WhatsApp. El vecino tiene que escribir primero; las plantillas de campaña las manda cobranzas.",
    };
  }

  let quotedWaMessageId: string | null = null;
  let quotedMessageId: string | null = null;
  let quotedBodyPreview: string | null = null;
  if (input.quotedMessageId) {
    const { data: quoted, error: qErr } = await supabase
      .from("messages")
      .select("id, conversation_id, wa_message_id, type, body")
      .eq("id", input.quotedMessageId)
      .eq("sector_id", sectorId)
      .maybeSingle();
    if (qErr || !quoted) {
      return { ok: false, error: "El mensaje a citar no existe." };
    }
    if (quoted.conversation_id !== input.conversationId) {
      return {
        ok: false,
        error: "Solo se puede citar un mensaje del mismo chat.",
      };
    }
    if (!quoted.wa_message_id) {
      return {
        ok: false,
        error: "Ese mensaje todavía no tiene id de WhatsApp.",
      };
    }
    quotedMessageId = quoted.id as string;
    quotedWaMessageId = quoted.wa_message_id as string;
    quotedBodyPreview = quotePreview(
      quoted.type as MessageType,
      (quoted.body as string | null) ?? null,
    );
  }

  const preview = previewFor("text", body);
  const now = new Date().toISOString();

  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .insert({
      sector_id: sectorId,
      conversation_id: input.conversationId,
      direction: "out",
      type: "text",
      body,
      media_bucket_path: null,
      sent_by: profileId,
      delivery_status: "pending",
      source: "live",
      outbound_origin: "crm",
      quoted_message_id: quotedMessageId,
      quoted_wa_message_id: quotedWaMessageId,
      quoted_body_preview: quotedBodyPreview,
    })
    .select("id")
    .single();

  if (msgErr || !message) {
    return {
      ok: false,
      error: msgErr?.message ?? "No se pudo crear el mensaje.",
    };
  }

  const send = await sendKapsoText({
    phoneNumberId,
    toE164,
    body,
    bizOpaqueCallbackData: `crm:${message.id}`,
    quotedWaMessageId,
  });

  if (!send.ok) {
    // No authenticated UPDATE on messages (ticks = service_role).
    const admin = createAdminClient();
    await admin
      .from("messages")
      .update({ delivery_status: "failed" })
      .eq("id", message.id);
    const reengage =
      send.code === 131047
        ? " Fuera de ventana 24 h (Meta #131047)."
        : "";
    return { ok: false, error: `${send.error}${reengage}` };
  }

  // Persist wamid via service_role — authenticated has no UPDATE on messages.
  const admin = createAdminClient();
  const { error: linkErr } = await admin
    .from("messages")
    .update({
      wa_message_id: send.wamid,
      delivery_status: "sent",
    })
    .eq("id", message.id);

  let finalMessageId = message.id as string;

  if (linkErr) {
    // Unique race: webhook already inserted with this wamid — adopt echo, drop orphan.
    const { data: echo } = await admin
      .from("messages")
      .select("id")
      .eq("sector_id", sectorId)
      .eq("wa_message_id", send.wamid)
      .maybeSingle();

    if (echo?.id && echo.id !== message.id) {
      await admin
        .from("messages")
        .update({
          sent_by: profileId,
          outbound_origin: "crm",
          delivery_status: "sent",
        })
        .eq("id", echo.id);
      await admin.from("messages").delete().eq("id", message.id);
      finalMessageId = echo.id as string;
    } else {
      return {
        ok: false,
        error: linkErr.message || "No se pudo guardar el id de WhatsApp.",
      };
    }
  }

  await supabase
    .from("conversations")
    .update({
      last_message_at: now,
      last_message_preview: preview,
    })
    .eq("id", input.conversationId)
    .eq("sector_id", sectorId);

  return { ok: true, messageId: finalMessageId };
}

export async function uploadOutboundMedia(formData: FormData): Promise<
  | { ok: true; path: string; type: MessageType }
  | { ok: false; error: string }
> {
  const { profile, sector } = await requireActiveSector();
  const supabase = await createClient();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Archivo vacío." };
  }

  // MediaRecorder often sets `audio/webm;codecs=opus` — Storage allowlist is exact.
  const mime = (file.type || "application/octet-stream").split(";")[0].trim();
  let type: MessageType;
  if (mime.startsWith("image/")) type = "image";
  else if (mime.startsWith("audio/")) type = "audio";
  else if (
    mime === "application/pdf" ||
    mime.startsWith("application/") ||
    mime.startsWith("text/")
  ) {
    type = "document";
  } else {
    return { ok: false, error: "Tipo de archivo no permitido." };
  }

  // Optional: magic-bytes validation (requires `npm install file-type`)
  // Uncomment after installing `file-type`:
  // import { fileTypeFromBuffer } from "file-type";
  // const buf = Buffer.from(await file.arrayBuffer());
  // const detected = await fileTypeFromBuffer(buf);
  // if (!detected || !ALLOWED_MIME.has(detected.mime)) {
  //   return { ok: false, error: "Tipo de archivo no válido (magic-bytes mismatch)." };
  // }

  const extFromName =
    file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "";
  const extFromMime =
    mime === "audio/webm"
      ? "webm"
      : mime === "audio/ogg" || mime.includes("ogg")
        ? "ogg"
        : mime === "audio/mp4" || mime === "audio/m4a"
          ? "m4a"
          : mime === "audio/mpeg"
            ? "mp3"
            : "";
  const ext = extFromName || extFromMime || "bin";
  const path = `outbound/${sector.id}/${profile.id}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(path, file, { contentType: mime, upsert: false });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, path, type };
}
