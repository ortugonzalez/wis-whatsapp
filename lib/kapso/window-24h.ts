import type { SupabaseClient } from "@supabase/supabase-js";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type KapsoServiceWindowResult =
  | { ok: true; open: boolean; lastInboundAt: string | null }
  | { ok: false; error: string };

/** True if last inbound message in conversation is within 24h (Cloud API service window). */
export async function isWithinKapsoServiceWindow(
  supabase: SupabaseClient,
  opts: { sectorId: string; conversationId: string },
): Promise<KapsoServiceWindowResult> {
  const { data, error } = await supabase
    .from("messages")
    .select("created_at")
    .eq("sector_id", opts.sectorId)
    .eq("conversation_id", opts.conversationId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data?.created_at) {
    return { ok: true, open: false, lastInboundAt: null };
  }
  const last = new Date(data.created_at).getTime();
  const open = Date.now() - last < WINDOW_MS;
  return { ok: true, open, lastInboundAt: data.created_at };
}
