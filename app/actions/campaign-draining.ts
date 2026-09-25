"use server";

import { isCampaignDrainingForSector } from "@/lib/inbox/campaign-draining";
import { createClient } from "@/lib/supabase/server";

/** Poll liviano para el banner CRM (misma sesión autenticada). */
export async function fetchCampaignDraining(
  sectorId: string,
): Promise<boolean> {
  if (!sectorId.trim()) return false;
  const supabase = await createClient();
  return isCampaignDrainingForSector(supabase, sectorId);
}
