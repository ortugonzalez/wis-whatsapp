import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Señal local ADR 005 / S22: outbox campaña cobranzas pending|sending en el sector.
 * Fail-open para UI (error → false): el banner no debe asustar si la query falla.
 */
export async function isCampaignDrainingForSector(
  supabase: SupabaseClient,
  sectorId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("whatsapp_outbox")
    .select("id", { count: "exact", head: true })
    .eq("sector_id", sectorId)
    .in("status", ["pending", "sending"])
    .or(
      "client_ref->>source.eq.cobranzas,client_ref->>source.eq.cobranzas_campaign",
    );
  if (error) {
    console.warn("campaign_draining_ui_query", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}
