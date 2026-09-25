import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SectorRow } from "@/lib/sectors/connection";

export const COOKIE_NAME = "wa_active_sector";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // ~30 days

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SEC,
  };
}

export async function getActiveSectorIdFromCookie(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value?.trim() ?? "";
  if (!raw || !UUID_RE.test(raw)) return null;
  return raw;
}

export async function setActiveSectorCookie(sectorId: string): Promise<void> {
  if (!UUID_RE.test(sectorId)) {
    throw new Error("Invalid sector id");
  }
  const jar = await cookies();
  jar.set(COOKIE_NAME, sectorId, cookieOptions());
}

export async function clearActiveSectorCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { ...cookieOptions(), maxAge: 0 });
}

export async function listMembershipSectors(
  supabase: SupabaseClient,
  profileId: string,
): Promise<SectorRow[]> {
  const { data, error } = await supabase
    .from("sector_memberships")
    .select("sectors(id, slug, display_name, channel_provider)")
    .eq("profile_id", profileId);
  if (error) throw error;

  const rows: SectorRow[] = [];
  for (const row of data ?? []) {
    const sector = Array.isArray(row.sectors) ? row.sectors[0] : row.sectors;
    if (
      sector &&
      typeof sector === "object" &&
      "id" in sector &&
      "slug" in sector &&
      "display_name" in sector
    ) {
      const provider =
        "channel_provider" in sector &&
        (sector.channel_provider === "kapso" ||
          sector.channel_provider === "baileys")
          ? sector.channel_provider
          : "baileys";
      rows.push({
        id: sector.id as string,
        slug: sector.slug as string,
        display_name: sector.display_name as string,
        channel_provider: provider,
      });
    }
  }
  rows.sort((a, b) => a.display_name.localeCompare(b.display_name, "es"));
  return rows;
}

/**
 * Resolve the active sector for this request.
 * Cookie set for the single-membership auto-path only works in Server Actions /
 * Route Handlers; from RSC we redirect through /api/active-sector/bootstrap.
 */
export async function resolveActiveSector(
  supabase: SupabaseClient,
  profileId: string,
): Promise<SectorRow> {
  const result = await resolveActiveSectorResult(supabase, profileId);
  if (result.ok) return result.sector;
  if (result.code === "no_sector") redirect("/login?error=no_sector");
  if (result.code === "bootstrap" && result.sectorId) {
    redirect(
      `/api/active-sector/bootstrap?sectorId=${encodeURIComponent(result.sectorId)}`,
    );
  }
  redirect("/select-sector");
}

export type ActiveSectorResolveResult =
  | { ok: true; sector: SectorRow }
  | {
      ok: false;
      code: "no_sector" | "select_sector" | "bootstrap";
      sectorId?: string;
    };

/** Non-redirecting resolve for Route Handlers that must return JSON. */
export async function resolveActiveSectorResult(
  supabase: SupabaseClient,
  profileId: string,
): Promise<ActiveSectorResolveResult> {
  const sectors = await listMembershipSectors(supabase, profileId);

  if (sectors.length === 0) {
    return { ok: false, code: "no_sector" };
  }

  const cookieId = await getActiveSectorIdFromCookie();
  if (cookieId) {
    const matched = sectors.find((s) => s.id === cookieId);
    if (matched) return { ok: true, sector: matched };
  }

  if (sectors.length === 1) {
    const only = sectors[0];
    return { ok: false, code: "bootstrap", sectorId: only.id };
  }

  return { ok: false, code: "select_sector" };
}
