import type { DeliveryStatus, MessageDirection } from "@/lib/supabase/types";

export type LastMessageMeta = {
  direction: MessageDirection | null;
  delivery_status: DeliveryStatus | null;
};

/** Takes the newest nested `messages` row (limit 1 + order desc on the query). */
export function lastMessageMetaFromEmbed(
  messages: unknown,
): LastMessageMeta {
  const row = Array.isArray(messages) ? messages[0] : messages;
  if (!row || typeof row !== "object") {
    return { direction: null, delivery_status: null };
  }
  const m = row as {
    direction?: string;
    delivery_status?: string;
  };
  const direction =
    m.direction === "in" || m.direction === "out" ? m.direction : null;
  const delivery_status =
    m.delivery_status === "pending" ||
    m.delivery_status === "sent" ||
    m.delivery_status === "delivered" ||
    m.delivery_status === "read" ||
    m.delivery_status === "failed"
      ? m.delivery_status
      : null;
  return { direction, delivery_status };
}

// Disambiguate: team_read_message_id adds a second conversations↔messages FK.
export const CONVERSATION_LIST_SELECT =
  "id, sector_id, kind, title, last_message_at, last_message_preview, team_read_at, team_read_by, team_read_via, contacts(display_name, agenda_name, verified_name, push_name, phone_e164, avatar_path), messages!messages_conversation_id_fkey(direction, delivery_status)";
