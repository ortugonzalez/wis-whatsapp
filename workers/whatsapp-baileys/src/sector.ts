import type { SupabaseClient } from "@supabase/supabase-js";

/** Documented Sector A slug — never used as a silent runtime default. */
export const DEFAULT_SECTOR_SLUG = "sector-a";

let cachedSectorId: string | null = null;
let cachedSlug: string | null = null;

/** Require SECTOR_SLUG so a misconfigured 2nd VM cannot drain Sector A by accident. */
export function workerSectorSlug(): string {
  const raw = process.env.SECTOR_SLUG?.trim() ?? "";
  if (!raw) {
    throw new Error(
      "SECTOR_SLUG is required (e.g. sector-a, sector-b, or treasury)",
    );
  }
  return raw;
}

/** Resolve and cache sector_id for this worker process. */
export async function resolveWorkerSectorId(
  supabase: SupabaseClient,
): Promise<string> {
  const slug = workerSectorSlug();
  if (cachedSectorId && cachedSlug === slug) return cachedSectorId;
  const { data, error } = await supabase
    .from("sectors")
    .select("id, channel_provider")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    throw new Error(`Unknown SECTOR_SLUG=${slug}`);
  }
  if (data.channel_provider === "kapso") {
    throw new Error(
      `SECTOR_SLUG=${slug} is channel_provider=kapso — no Baileys worker (ADR 008)`,
    );
  }
  cachedSectorId = data.id;
  cachedSlug = slug;
  return data.id;
}

export function clearWorkerSectorCache() {
  cachedSectorId = null;
  cachedSlug = null;
}
