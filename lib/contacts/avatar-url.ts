import { WHATSAPP_MEDIA_BUCKET } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Map storage paths → short-lived signed URLs (private bucket). */
export async function signedAvatarUrls(
  supabase: SupabaseClient,
  paths: (string | null | undefined)[],
  expiresSec = 3600,
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(paths.filter((p): p is string => Boolean(p && p.trim()))),
  ];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const { data, error } = await supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .createSignedUrls(unique, expiresSec);
  if (error || !data) return out;

  for (const row of data) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}
