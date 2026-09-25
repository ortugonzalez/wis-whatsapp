import { requireActiveProfile } from "@/lib/auth/require-member";
import {
  resolveActiveSector,
  resolveActiveSectorResult,
  setActiveSectorCookie,
} from "@/lib/sectors/active-sector";
import type { SectorRow } from "@/lib/sectors/connection";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

export async function requireActiveSector(): Promise<{
  profile: Profile;
  userId: string;
  sector: SectorRow;
}> {
  const { profile, userId } = await requireActiveProfile();
  const supabase = await createClient();
  const sector = await resolveActiveSector(supabase, profile.id);
  return { profile, userId, sector };
}

/**
 * For Route Handlers: never redirects. Sets cookie when single-membership bootstrap.
 * Returns JSON-friendly error codes for the client.
 */
export async function requireActiveSectorApi(): Promise<
  | { ok: true; profile: Profile; userId: string; sector: SectorRow }
  | { ok: false; status: number; error: string }
> {
  const { profile, userId } = await requireActiveProfile();
  const supabase = await createClient();
  const result = await resolveActiveSectorResult(supabase, profile.id);
  if (result.ok) {
    return { ok: true, profile, userId, sector: result.sector };
  }
  if (result.code === "no_sector") {
    return { ok: false, status: 403, error: "no_sector" };
  }
  if (result.code === "bootstrap" && result.sectorId) {
    await setActiveSectorCookie(result.sectorId);
    const sectors = await resolveActiveSectorResult(supabase, profile.id);
    if (sectors.ok) {
      return { ok: true, profile, userId, sector: sectors.sector };
    }
  }
  return { ok: false, status: 409, error: "select_sector" };
}
