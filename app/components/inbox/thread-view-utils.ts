import type {
  DeliveryStatus,
  MessageDirection,
  MessageType,
} from "@/lib/supabase/types";
import { formatInboxDateTime } from "@/lib/inbox/format-datetime";

export type ThreadMessage = {
  id: string;
  wa_message_id: string | null;
  direction: MessageDirection;
  type: MessageType;
  body: string | null;
  media_bucket_path: string | null;
  delivery_status: DeliveryStatus;
  created_at: string;
  deleted_at: string | null;
  author_label: string | null;
  quoted_message_id: string | null;
  quoted_wa_message_id: string | null;
  quoted_body_preview: string | null;
};

export const DELETED_MESSAGE_LABEL = "Se eliminó este mensaje.";

export function isMessageDeleted(m: ThreadMessage): boolean {
  return Boolean(m.deleted_at);
}

export function bodyLabel(m: ThreadMessage): string {
  if (isMessageDeleted(m)) return DELETED_MESSAGE_LABEL;
  if (m.type === "text") return m.body || "";
  if (m.body) return `${m.type}: ${m.body}`;
  if (m.type === "image") return "Imagen";
  if (m.type === "audio") return "Audio";
  return "Documento";
}

export function formatTime(iso: string): string {
  return formatInboxDateTime(iso);
}

export function mergeThreadRows(
  server: ThreadMessage[],
  local: ThreadMessage[],
): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>();
  for (const row of server) byId.set(row.id, row);
  for (const row of local) {
    const prev = byId.get(row.id);
    if (!prev) {
      byId.set(row.id, row);
      continue;
    }
    const rank: Record<string, number> = {
      pending: 0,
      sent: 1,
      delivered: 2,
      read: 3,
      failed: 99,
    };
    // Retry optimism: local pending must win over server failed until the worker updates.
    const retryPending =
      row.delivery_status === "pending" && prev.delivery_status === "failed";
    const useLocalTick =
      retryPending ||
      (rank[row.delivery_status] ?? 0) > (rank[prev.delivery_status] ?? 0);
    byId.set(row.id, {
      ...prev,
      ...row,
      delivery_status: useLocalTick
        ? row.delivery_status
        : prev.delivery_status,
      author_label: row.author_label ?? prev.author_label,
      wa_message_id: row.wa_message_id ?? prev.wa_message_id,
      quoted_message_id: row.quoted_message_id ?? prev.quoted_message_id,
      quoted_wa_message_id:
        row.quoted_wa_message_id ?? prev.quoted_wa_message_id,
      quoted_body_preview:
        row.quoted_body_preview ?? prev.quoted_body_preview,
      deleted_at: row.deleted_at ?? prev.deleted_at,
    });
  }
  return [...byId.values()].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
}
