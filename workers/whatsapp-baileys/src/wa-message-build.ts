import type { SupabaseClient } from "@supabase/supabase-js";

/** Chat JID where the stanza lives (LID for MD 1:1; group @g.us). */
export async function resolveQuoteChatJid(
  supabase: SupabaseClient,
  conversationId: string | null,
  sendJid: string,
): Promise<string> {
  if (!conversationId) return sendJid;

  const { data: conv } = await supabase
    .from("conversations")
    .select("wa_chat_id, kind, contacts(wa_lid)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return sendJid;

  const waChatId = (conv.wa_chat_id as string | null)?.trim() || null;
  if (conv.kind === "group" && waChatId) return waChatId;

  const contact = Array.isArray(conv.contacts)
    ? conv.contacts[0]
    : conv.contacts;
  const waLid = (contact as { wa_lid?: string | null } | null)?.wa_lid?.trim();
  if (waLid?.endsWith("@lid")) return waLid;
  if (waChatId?.endsWith("@lid")) return waChatId;
  if (waChatId) return waChatId;
  return sendJid;
}
