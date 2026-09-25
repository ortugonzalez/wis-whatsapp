import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeDisplayName } from "./display-name.js";
import { resolveWorkerSectorId } from "./sector.js";
import { loadWorkerPacingConfig, todayDateInTz } from "./pacing.js";
// Worker uses service_role only (VM env).

export type ConnectionRow = {
  id: string;
  status: "disconnected" | "qr_pending" | "connected";
  qr_payload: string | null;
  phone: string | null;
  last_error: string | null;
  circuit_open_until?: string | null;
  circuit_reason?: string | null;
  sends_today?: number | null;
  sends_today_date?: string | null;
  last_send_at?: string | null;
};

export type OutboxRow = {
  id: string;
  to_e164: string | null;
  to_jid: string | null;
  conversation_id: string | null;
  message_id: string | null;
  type: string;
  body: string | null;
  media_bucket_path: string | null;
  quoted_wa_message_id: string | null;
  status: string;
  attempts: number;
  client_ref?: unknown;
  /** Campaign label to assign after sent (S27). */
  crm_label_id?: string | null;
};

export function createWorkerSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function fetchConnection(
  supabase: SupabaseClient,
): Promise<ConnectionRow | null> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select(
      "id, status, qr_payload, phone, last_error, circuit_open_until, circuit_reason, sends_today, sends_today_date, last_send_at",
    )
    .eq("sector_id", sectorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** S33: one RPC instead of probing every queue on idle safety poll. */
export type WorkerPeekPending = {
  outbox: boolean;
  label_ops: boolean;
  catalog_ops: boolean;
  chat_read_ops: boolean;
  message_ops: boolean;
};

export async function peekWorkerPending(
  supabase: SupabaseClient,
  sectorId: string,
): Promise<WorkerPeekPending> {
  const { data, error } = await supabase.rpc("worker_peek_pending", {
    p_sector_id: sectorId,
  });
  if (error) throw error;
  const row = (data ?? {}) as Partial<WorkerPeekPending>;
  return {
    outbox: Boolean(row.outbox),
    label_ops: Boolean(row.label_ops),
    catalog_ops: Boolean(row.catalog_ops),
    chat_read_ops: Boolean(row.chat_read_ops),
    message_ops: Boolean(row.message_ops),
  };
}

export async function patchConnection(
  supabase: SupabaseClient,
  patch: Partial<
    Pick<
      ConnectionRow,
      | "status"
      | "qr_payload"
      | "phone"
      | "last_error"
      | "circuit_open_until"
      | "circuit_reason"
      | "sends_today"
      | "sends_today_date"
      | "last_send_at"
    >
  >,
) {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { error } = await supabase
    .from("whatsapp_connections")
    .update(patch)
    .eq("sector_id", sectorId);
  if (error) throw error;
}

export async function reclaimOrphanSending(supabase: SupabaseClient) {
  const sectorId = await resolveWorkerSectorId(supabase);
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("whatsapp_outbox")
    .update({ status: "pending", last_error: "reclaimed_orphan_sending" })
    .eq("sector_id", sectorId)
    .eq("status", "sending")
    .lt("updated_at", cutoff);
  if (error) throw error;
}

export async function claimOutbox(
  supabase: SupabaseClient,
  limit = 5,
): Promise<OutboxRow[]> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data, error } = await supabase.rpc("claim_whatsapp_outbox", {
    p_limit: limit,
    p_sector_id: sectorId,
  });
  if (error) throw error;
  return (data ?? []) as OutboxRow[];
}

/** Campaña cobranzas pending/sending en el sector del worker (señal draining local). */
export async function hasCampaignOutboxDraining(
  supabase: SupabaseClient,
): Promise<boolean> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { count, error } = await supabase
    .from("whatsapp_outbox")
    .select("id", { count: "exact", head: true })
    .eq("sector_id", sectorId)
    .in("status", ["pending", "sending"])
    .or(
      "client_ref->>source.eq.cobranzas,client_ref->>source.eq.cobranzas_campaign",
    );
  if (error) {
    console.warn(
      JSON.stringify({
        event: "campaign_draining_query_error",
        error: error.message,
        fail_closed: true,
      }),
    );
    // Worker gate: preferir reloj activo si la señal falla (no intercalado CRM↔campaña).
    return true;
  }
  return (count ?? 0) > 0;
}

export async function markOutboxSent(
  supabase: SupabaseClient,
  id: string,
  waMessageId: string,
  messageId: string | null,
  opts?: { countDailyCap?: boolean },
) {
  const { error } = await supabase
    .from("whatsapp_outbox")
    .update({
      status: "sent",
      wa_message_id: waMessageId,
      last_error: null,
    })
    .eq("id", id);
  if (error) throw error;

  if (messageId) {
    await markMessageDelivery(supabase, messageId, "sent", waMessageId);
  }

  // Contador diario solo campañas (tope anti-ban); last_send_at siempre.
  try {
    const cfg = loadWorkerPacingConfig();
    const today = todayDateInTz(cfg.tz);
    const conn = await fetchConnection(supabase);
    const patch: Parameters<typeof patchConnection>[1] = {
      last_send_at: new Date().toISOString(),
    };
    if (opts?.countDailyCap) {
      const prev =
        conn?.sends_today_date === today ? Number(conn.sends_today ?? 0) : 0;
      patch.sends_today = prev + 1;
      patch.sends_today_date = today;
    }
    await patchConnection(supabase, patch);
  } catch {
    // no bloquear el send por telemetría
  }
}

/** Devuelve a pending un claim que no debía enviarse aún (gates / cooldown). */
export async function releaseOutboxToPending(
  supabase: SupabaseClient,
  id: string,
  attempts: number,
  lastError: string,
) {
  const { error } = await supabase
    .from("whatsapp_outbox")
    .update({
      status: "pending",
      last_error: lastError.slice(0, 500),
      attempts: Math.max(0, attempts - 1),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function markOutboxFailed(
  supabase: SupabaseClient,
  id: string,
  lastError: string,
  messageId: string | null,
) {
  const { error } = await supabase
    .from("whatsapp_outbox")
    .update({ status: "failed", last_error: lastError.slice(0, 500) })
    .eq("id", id);
  if (error) throw error;

  if (messageId) {
    await markMessageDelivery(supabase, messageId, "failed");
  }
}

/** After onWhatsApp: keep contact/conversation aligned with the resolved PN JID. */
export async function bindResolvedPnJid(
  supabase: SupabaseClient,
  input: {
    toE164: string;
    conversationId: string | null;
    jid: string;
  },
) {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { error: contactErr } = await supabase
    .from("contacts")
    .update({ wa_jid: input.jid })
    .eq("sector_id", sectorId)
    .eq("phone_e164", input.toE164);
  if (contactErr) {
    // Unique conflict if another contact already owns this jid — non-fatal.
    console.warn(
      JSON.stringify({
        event: "bind_jid_contact_skip",
        error: contactErr.message,
        jid: input.jid,
      }),
    );
  }

  if (!input.conversationId) return;

  // Refuse to rebind wa_chat_id unless the conversation's contact owns toE164
  // (defense vs malformed outbox rows that pair a foreign conversation_id).
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, contacts(phone_e164)")
    .eq("id", input.conversationId)
    .maybeSingle();
  const contact = Array.isArray(conv?.contacts)
    ? conv?.contacts[0]
    : conv?.contacts;
  const phone = (contact as { phone_e164?: string | null } | null)?.phone_e164;
  if (!phone || phone !== input.toE164) {
    console.warn(
      JSON.stringify({
        event: "bind_jid_conversation_mismatch",
        conversationId: input.conversationId,
        toE164: input.toE164,
        contactPhone: phone ?? null,
      }),
    );
    return;
  }

  const { error: convErr } = await supabase
    .from("conversations")
    .update({ wa_chat_id: input.jid })
    .eq("id", input.conversationId);
  if (convErr) {
    console.warn(
      JSON.stringify({
        event: "bind_jid_conversation_skip",
        error: convErr.message,
        conversationId: input.conversationId,
        jid: input.jid,
      }),
    );
  }
}

/**
 * not_on_whatsapp cleanup (S11): drop the failed outbound message and, if the
 * conversation has no other messages, delete conversation + orphan contact.
 * service_role only. Requires message_id belonging to conversation_id and
 * contact.phone_e164 === toE164.
 */
export async function cleanupNotOnWhatsAppOrphan(
  supabase: SupabaseClient,
  input: {
    conversationId: string | null;
    messageId: string | null;
    toE164: string;
  },
) {
  if (!input.conversationId || !input.messageId) {
    console.warn(
      JSON.stringify({
        event: "cleanup_not_on_whatsapp_skip_incomplete",
        conversationId: input.conversationId,
        messageId: input.messageId,
        toE164: input.toE164,
      }),
    );
    return;
  }

  const { data: msg } = await supabase
    .from("messages")
    .select("id, conversation_id, direction")
    .eq("id", input.messageId)
    .maybeSingle();
  if (
    !msg ||
    msg.conversation_id !== input.conversationId ||
    msg.direction !== "out"
  ) {
    console.warn(
      JSON.stringify({
        event: "cleanup_not_on_whatsapp_skip_bad_message",
        conversationId: input.conversationId,
        messageId: input.messageId,
      }),
    );
    return;
  }

  const { data: convPhone } = await supabase
    .from("conversations")
    .select("id, contacts(phone_e164)")
    .eq("id", input.conversationId)
    .maybeSingle();
  const contactPhoneRow = Array.isArray(convPhone?.contacts)
    ? convPhone?.contacts[0]
    : convPhone?.contacts;
  const phone = (contactPhoneRow as { phone_e164?: string | null } | null)
    ?.phone_e164;
  if (!phone || phone !== input.toE164) {
    console.warn(
      JSON.stringify({
        event: "cleanup_not_on_whatsapp_skip_phone_mismatch",
        conversationId: input.conversationId,
        toE164: input.toE164,
        contactPhone: phone ?? null,
      }),
    );
    return;
  }

  await supabase.from("messages").delete().eq("id", input.messageId);

  const { count, error: countErr } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", input.conversationId);
  if (countErr) return;
  if ((count ?? 0) > 0) return;

  const { data: conv } = await supabase
    .from("conversations")
    .select("contact_id")
    .eq("id", input.conversationId)
    .maybeSingle();

  await supabase.from("conversations").delete().eq("id", input.conversationId);

  const contactId = conv?.contact_id as string | undefined;
  if (!contactId) return;

  const { count: otherConvs } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId);
  if ((otherConvs ?? 0) > 0) return;

  // Keep Baileys-synced contacts (agenda/push/avatar); only drop new-chat stubs.
  const { data: contact } = await supabase
    .from("contacts")
    .select("agenda_name, verified_name, push_name, avatar_path")
    .eq("id", contactId)
    .maybeSingle();
  const named = Boolean(
    (contact?.agenda_name as string | undefined)?.trim() ||
      (contact?.verified_name as string | undefined)?.trim() ||
      (contact?.push_name as string | undefined)?.trim() ||
      contact?.avatar_path,
  );
  if (named) {
    console.info(
      JSON.stringify({
        event: "cleanup_not_on_whatsapp_keep_contact",
        toE164: input.toE164,
        conversationId: input.conversationId,
        contactId,
      }),
    );
    return;
  }

  await supabase.from("contacts").delete().eq("id", contactId);

  console.info(
    JSON.stringify({
      event: "cleanup_not_on_whatsapp",
      toE164: input.toE164,
      conversationId: input.conversationId,
      contactId,
    }),
  );
}

export async function markMessageDelivery(
  supabase: SupabaseClient,
  messageId: string,
  deliveryStatus: "pending" | "sent" | "delivered" | "read" | "failed",
  waMessageId?: string,
) {
  const patch: Record<string, string> = {
    delivery_status: deliveryStatus,
  };
  if (waMessageId) patch.wa_message_id = waMessageId;
  const { error } = await supabase
    .from("messages")
    .update(patch)
    .eq("id", messageId);
  if (error) throw error;
}

/** Revoke for everyone — keep row, clear content (WhatsApp Web stub in panel). */
export async function markMessageDeleted(
  supabase: SupabaseClient,
  input: { messageId?: string; waMessageId?: string },
): Promise<boolean> {
  const now = new Date().toISOString();
  const patch = {
    deleted_at: now,
    body: null,
    media_bucket_path: null,
    quoted_message_id: null,
    quoted_wa_message_id: null,
    quoted_body_preview: null,
  };

  if (input.messageId) {
    const { data, error } = await supabase
      .from("messages")
      .update(patch)
      .eq("id", input.messageId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }

  if (input.waMessageId) {
    const sectorId = await resolveWorkerSectorId(supabase);
    const { data, error } = await supabase
      .from("messages")
      .update(patch)
      .eq("sector_id", sectorId)
      .eq("wa_message_id", input.waMessageId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }

  return false;
}

export type LiveMessageRow = {
  conversation_id: string;
  wa_message_id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  media_bucket_path: string | null;
  sent_by: null;
  delivery_status: "pending" | "sent" | "delivered" | "read" | "failed";
  source: "live";
  wa_sender_jid?: string | null;
  wa_sender_name?: string | null;
  quoted_message_id?: string | null;
  quoted_wa_message_id?: string | null;
  quoted_body_preview?: string | null;
};

/** @deprecated alias — use LiveMessageRow */
export type InboundMessageRow = LiveMessageRow & { direction: "in" };

async function findContactId(
  supabase: SupabaseClient,
  input: {
    waJid: string | null;
    waLid: string | null;
    phoneE164: string | null;
  },
): Promise<string | null> {
  const sectorId = await resolveWorkerSectorId(supabase);
  if (input.waLid) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id")
      .eq("sector_id", sectorId)
      .eq("wa_lid", input.waLid)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id as string;
  }
  if (input.waJid) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id")
      .eq("sector_id", sectorId)
      .eq("wa_jid", input.waJid)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id as string;
  }
  if (input.phoneE164) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id")
      .eq("sector_id", sectorId)
      .eq("phone_e164", input.phoneE164)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id as string;
  }
  return null;
}

/** One direct chat per contact — merge PN JID vs LID duplicates (S12). */
async function mergeDirectConversationsForContact(
  supabase: SupabaseClient,
  contactId: string,
  preferredWaChatId?: string | null,
): Promise<string | null> {
  const { data: convs, error } = await supabase
    .from("conversations")
    .select("id, wa_chat_id, last_message_at")
    .eq("contact_id", contactId)
    .eq("kind", "direct")
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  if (!convs?.length) return null;

  const preferred = preferredWaChatId
    ? convs.find((c) => c.wa_chat_id === preferredWaChatId)
    : undefined;
  const keeper = preferred ?? convs[0];
  const keeperId = keeper.id as string;
  const duplicates = convs.filter((c) => c.id !== keeperId);

  for (const dup of duplicates) {
    const dupId = dup.id as string;

    const { error: msgErr } = await supabase
      .from("messages")
      .update({ conversation_id: keeperId })
      .eq("conversation_id", dupId);
    if (msgErr) throw msgErr;

    const { error: outboxErr } = await supabase
      .from("whatsapp_outbox")
      .update({ conversation_id: keeperId })
      .eq("conversation_id", dupId);
    if (outboxErr) throw outboxErr;

    const { data: dupLabels, error: labelsReadErr } = await supabase
      .from("conversation_labels")
      .select("label_id")
      .eq("conversation_id", dupId);
    if (labelsReadErr) throw labelsReadErr;

    for (const row of dupLabels ?? []) {
      const { error: labelErr } = await supabase
        .from("conversation_labels")
        .insert({
          conversation_id: keeperId,
          label_id: row.label_id as string,
        });
      if (labelErr && !/duplicate key|unique constraint/i.test(labelErr.message)) {
        throw labelErr;
      }
    }

    const { error: delErr } = await supabase
      .from("conversations")
      .delete()
      .eq("id", dupId);
    if (delErr) throw delErr;
  }

  return keeperId;
}

export async function upsertContactConversation(
  supabase: SupabaseClient,
  input: {
    waChatId: string;
    waJid: string | null;
    waLid: string | null;
    phoneE164: string | null;
    pushName: string;
    preview: string;
  },
): Promise<{ contactId: string; conversationId: string }> {
  let contactId = await findContactId(supabase, input);

  if (contactId) {
    const { data: existing, error: readErr } = await supabase
      .from("contacts")
      .select("agenda_name, verified_name, push_name, phone_e164")
      .eq("id", contactId)
      .maybeSingle();
    if (readErr) throw readErr;

    const patch: Record<string, string | null> = {};
    if (input.waJid) patch.wa_jid = input.waJid;
    if (input.waLid) patch.wa_lid = input.waLid;
    if (input.phoneE164) patch.phone_e164 = input.phoneE164;
    const nextPush =
      input.pushName.trim() ||
      (existing?.push_name as string | undefined) ||
      "";
    if (input.pushName.trim()) patch.push_name = input.pushName.trim();
    patch.display_name = computeDisplayName({
      agenda_name: (existing?.agenda_name as string) ?? "",
      verified_name: (existing?.verified_name as string) ?? "",
      push_name: nextPush,
      phone_e164: input.phoneE164 ?? (existing?.phone_e164 as string | null),
    });
    const { error } = await supabase
      .from("contacts")
      .update(patch)
      .eq("id", contactId);
    if (error) throw error;
  } else {
    const sectorId = await resolveWorkerSectorId(supabase);
    const push = input.pushName.trim();
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        sector_id: sectorId,
        wa_jid: input.waJid,
        wa_lid: input.waLid,
        phone_e164: input.phoneE164,
        push_name: push,
        agenda_name: "",
        verified_name: "",
        display_name: computeDisplayName({
          push_name: push,
          phone_e164: input.phoneE164,
        }),
      })
      .select("id")
      .single();
    if (error) throw error;
    contactId = data.id as string;
  }

  if (!contactId) {
    throw new Error("contact_upsert_failed");
  }

  const now = new Date().toISOString();

  let conversationId: string | null = await mergeDirectConversationsForContact(
    supabase,
    contactId,
    input.waChatId,
  );

  if (!conversationId) {
    const sectorId = await resolveWorkerSectorId(supabase);
    const { data: byWaChat, error: convLookupErr } = await supabase
      .from("conversations")
      .select("id")
      .eq("sector_id", sectorId)
      .eq("wa_chat_id", input.waChatId)
      .maybeSingle();
    if (convLookupErr) throw convLookupErr;
    conversationId = (byWaChat?.id as string | undefined) ?? null;
  }

  if (conversationId) {
    const { error } = await supabase
      .from("conversations")
      .update({
        last_message_at: now,
        last_message_preview: input.preview,
        contact_id: contactId,
        kind: "direct",
        wa_chat_id: input.waChatId,
      })
      .eq("id", conversationId);
    if (error) throw error;
    return { contactId, conversationId };
  }

  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: created, error: convErr } = await supabase
    .from("conversations")
    .insert({
      sector_id: sectorId,
      contact_id: contactId,
      wa_chat_id: input.waChatId,
      kind: "direct",
      last_message_at: now,
      last_message_preview: input.preview,
    })
    .select("id")
    .single();
  if (convErr) throw convErr;
  return { contactId, conversationId: created.id as string };
}

/** Upsert a group conversation (no contact). Title best-effort. */
export async function upsertGroupConversation(
  supabase: SupabaseClient,
  input: {
    waChatId: string;
    title: string | null;
    preview: string;
  },
): Promise<{ conversationId: string }> {
  const now = new Date().toISOString();
  const sectorId = await resolveWorkerSectorId(supabase);
  const { data: existingConv, error: convLookupErr } = await supabase
    .from("conversations")
    .select("id, title")
    .eq("sector_id", sectorId)
    .eq("wa_chat_id", input.waChatId)
    .maybeSingle();
  if (convLookupErr) throw convLookupErr;

  if (existingConv?.id) {
    const patch: Record<string, string | null> = {
      last_message_at: now,
      last_message_preview: input.preview,
      kind: "group",
      contact_id: null,
    };
    const nextTitle = input.title?.trim() || null;
    if (nextTitle) patch.title = nextTitle;
    const { error } = await supabase
      .from("conversations")
      .update(patch)
      .eq("id", existingConv.id);
    if (error) throw error;
    return { conversationId: existingConv.id as string };
  }

  const { data: created, error: convErr } = await supabase
    .from("conversations")
    .insert({
      sector_id: sectorId,
      contact_id: null,
      wa_chat_id: input.waChatId,
      kind: "group",
      title: input.title?.trim() || null,
      last_message_at: now,
      last_message_preview: input.preview,
    })
    .select("id")
    .single();
  if (convErr) throw convErr;
  return { conversationId: created.id as string };
}

/** Sync agenda / push / verified from Baileys contacts.* events (S9). */
export async function applyBaileysContactFields(
  supabase: SupabaseClient,
  input: {
    waJid: string | null;
    waLid: string | null;
    phoneE164: string | null;
    agendaName?: string | null;
    pushName?: string | null;
    verifiedName?: string | null;
    avatarPath?: string | null;
  },
): Promise<string | null> {
  let contactId = await findContactId(supabase, input);

  const agenda =
    input.agendaName !== undefined && input.agendaName !== null
      ? input.agendaName.trim()
      : null;
  const push =
    input.pushName !== undefined && input.pushName !== null
      ? input.pushName.trim()
      : null;
  const verified =
    input.verifiedName !== undefined && input.verifiedName !== null
      ? input.verifiedName.trim()
      : null;

  if (!contactId) {
    if (!input.waJid && !input.waLid && !input.phoneE164) return null;
    if (!agenda && !push && !verified) return null;
    const sectorId = await resolveWorkerSectorId(supabase);
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        sector_id: sectorId,
        wa_jid: input.waJid,
        wa_lid: input.waLid,
        phone_e164: input.phoneE164,
        agenda_name: agenda ?? "",
        push_name: push ?? "",
        verified_name: verified ?? "",
        display_name: computeDisplayName({
          agenda_name: agenda,
          verified_name: verified,
          push_name: push,
          phone_e164: input.phoneE164,
        }),
        avatar_path: input.avatarPath ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  const { data: existing, error: readErr } = await supabase
    .from("contacts")
    .select("agenda_name, verified_name, push_name, phone_e164")
    .eq("id", contactId)
    .maybeSingle();
  if (readErr) throw readErr;

  const nextAgenda =
    agenda !== null ? agenda : ((existing?.agenda_name as string) ?? "");
  const nextPush =
    push !== null ? push : ((existing?.push_name as string) ?? "");
  const nextVerified =
    verified !== null ? verified : ((existing?.verified_name as string) ?? "");
  const nextPhone =
    input.phoneE164 ?? ((existing?.phone_e164 as string | null) ?? null);

  const patch: Record<string, string | null> = {
    display_name: computeDisplayName({
      agenda_name: nextAgenda,
      verified_name: nextVerified,
      push_name: nextPush,
      phone_e164: nextPhone,
    }),
  };
  if (input.waJid) patch.wa_jid = input.waJid;
  if (input.waLid) patch.wa_lid = input.waLid;
  if (input.phoneE164) patch.phone_e164 = input.phoneE164;
  if (agenda !== null) patch.agenda_name = agenda;
  if (push !== null) patch.push_name = push;
  if (verified !== null) patch.verified_name = verified;
  if (input.avatarPath !== undefined) {
    patch.avatar_path = input.avatarPath;
  }

  const { error } = await supabase
    .from("contacts")
    .update(patch)
    .eq("id", contactId);
  if (error) throw error;
  return contactId;
}

/** Insert live message (inbound or fromMe echo); returns false on duplicate wa_message_id. */
export async function insertLiveMessage(
  supabase: SupabaseClient,
  row: LiveMessageRow,
): Promise<boolean> {
  const sectorId = await resolveWorkerSectorId(supabase);
  const { error } = await supabase.from("messages").insert({
    ...row,
    sector_id: sectorId,
  });
  if (error) {
    if (error.code === "23505") return false;
    throw error;
  }
  return true;
}

/** @deprecated use insertLiveMessage */
export async function insertInboundMessage(
  supabase: SupabaseClient,
  row: LiveMessageRow,
): Promise<boolean> {
  return insertLiveMessage(supabase, row);
}
