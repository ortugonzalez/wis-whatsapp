import type { SupabaseClient } from "@supabase/supabase-js";

/** Fallback slug for worker / legacy callers; app UI uses the active-sector cookie. */
export const DEFAULT_SECTOR_SLUG = "sector-a";

export type ChannelProvider = "baileys" | "kapso";

export type SectorRow = {
  id: string;
  slug: string;
  display_name: string;
  channel_provider: ChannelProvider;
};

export type ConnectionStatus = "disconnected" | "qr_pending" | "connected";

export type ConnectionBySector = {
  id: string;
  sector_id: string;
  status: ConnectionStatus;
  qr_payload: string | null;
  phone: string | null;
  last_error: string | null;
  labels_write_enabled: boolean;
  kapso_phone_number_id: string | null;
};

const CONNECTION_SELECT =
  "id, sector_id, status, qr_payload, phone, last_error, labels_write_enabled, kapso_phone_number_id";

export async function fetchSectorBySlug(
  supabase: SupabaseClient,
  slug: string = DEFAULT_SECTOR_SLUG,
): Promise<SectorRow | null> {
  const { data, error } = await supabase
    .from("sectors")
    .select("id, slug, display_name, channel_provider")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as SectorRow | null;
}

export async function fetchConnectionBySectorId(
  supabase: SupabaseClient,
  sectorId: string,
): Promise<ConnectionBySector | null> {
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select(CONNECTION_SELECT)
    .eq("sector_id", sectorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchConnectionBySectorSlug(
  supabase: SupabaseClient,
  slug: string = DEFAULT_SECTOR_SLUG,
): Promise<ConnectionBySector | null> {
  const sector = await fetchSectorBySlug(supabase, slug);
  if (!sector) return null;
  return fetchConnectionBySectorId(supabase, sector.id);
}
