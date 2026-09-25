export type ProfileRole = "admin" | "agent";

export type Profile = {
  id: string;
  user_id: string | null;
  email: string;
  slug: string;
  first_name: string;
  last_name: string;
  role: ProfileRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Sector = {
  id: string;
  slug: string;
  display_name: string;
  channel_provider: "baileys" | "kapso";
  created_at: string;
  updated_at: string;
};

export type SectorMembership = {
  id: string;
  profile_id: string;
  sector_id: string;
  created_at: string;
};

export type MessageDirection = "in" | "out";
export type MessageType = "text" | "image" | "audio" | "document";
export type DeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";
export type MessageSource = "live" | "import";

/** Kapso mirrored outbound attribution (ADR 008 / K5). */
export type OutboundOrigin = "crm" | "cobranzas" | "system";

export type Contact = {
  id: string;
  sector_id: string;
  wa_jid: string | null;
  wa_lid: string | null;
  phone_e164: string | null;
  push_name: string;
  agenda_name: string;
  verified_name: string;
  display_name: string;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
};

export type Conversation = {
  id: string;
  sector_id: string;
  contact_id: string | null;
  wa_chat_id: string;
  kind: "direct" | "group";
  title: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  /** CRM team-wide read cursor (aligned with WA unread label). */
  team_read_at: string;
  team_read_by: string | null;
  team_read_message_id: string | null;
  /** crm = panel agent; whatsapp = cleared outside CRM; null = no attribution yet. */
  team_read_via: "crm" | "whatsapp" | null;
  /** Kapso platform conversation UUID (provider=kapso only). */
  kapso_conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  sector_id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: MessageDirection;
  type: MessageType;
  body: string | null;
  media_bucket_path: string | null;
  sent_by: string | null;
  delivery_status: DeliveryStatus;
  source: MessageSource;
  outbound_origin: OutboundOrigin | null;
  wa_sender_jid: string | null;
  wa_sender_name: string | null;
  quoted_message_id: string | null;
  quoted_wa_message_id: string | null;
  quoted_body_preview: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Label = {
  id: string;
  sector_id: string;
  wa_label_id: string;
  name: string;
  color: string | null;
  attrs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ConversationLabel = {
  conversation_id: string;
  label_id: string;
  created_at: string;
};

/** Private hot media bucket (slice S3). Use signed URLs — never public CDN. */
export const WHATSAPP_MEDIA_BUCKET = "whatsapp-media" as const;

export type WhatsappConnectionStatus =
  | "disconnected"
  | "qr_pending"
  | "connected";

export type WhatsappConnection = {
  id: string;
  sector_id: string;
  status: WhatsappConnectionStatus;
  qr_payload: string | null;
  phone: string | null;
  last_error: string | null;
  labels_write_enabled: boolean;
  kapso_phone_number_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OutboxStatus = "pending" | "sending" | "sent" | "failed";

export type WhatsappOutbox = {
  id: string;
  sector_id: string;
  to_e164: string | null;
  to_jid: string | null;
  conversation_id: string | null;
  message_id: string | null;
  type: MessageType;
  body: string | null;
  media_bucket_path: string | null;
  quoted_wa_message_id: string | null;
  sent_by: string | null;
  status: OutboxStatus;
  attempts: number;
  wa_message_id: string | null;
  last_error: string | null;
  /** Optional campaign label; worker assigns after sent (S26/S27). */
  crm_label_id: string | null;
  created_at: string;
  updated_at: string;
};
