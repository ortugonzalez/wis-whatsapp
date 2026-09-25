"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { requireAdmin } from "@/lib/whatsapp/admin";
import { backfillKapsoMessagesPage } from "@/lib/kapso/backfill";
import { KAPSO_SECTOR_SLUG } from "@/lib/kapso/ingest-message";

export type KapsoBackfillActionResult =
  | {
      ok: true;
      scanned: number;
      inserted: number;
      skippedExisting: number;
      skippedNoPhone: number;
      mediaSkipped: number;
      after: string | null;
      dryRun: boolean;
    }
  | { ok: false; error: string };

/** Admin: import one Kapso history page into kapso-8257 (idempotent by wamid). */
export async function runKapsoHistoryBackfillPage(input?: {
  dryRun?: boolean;
  after?: string | null;
  limit?: number;
}): Promise<KapsoBackfillActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Solo admin." };

  const { sector } = await requireActiveSector();
  if (sector.channel_provider !== "kapso" || sector.slug !== KAPSO_SECTOR_SLUG) {
    return {
      ok: false,
      error: `El sector activo debe ser ${KAPSO_SECTOR_SLUG}.`,
    };
  }

  const supabaseUser = await createClient();
  const connection = await fetchConnectionBySectorId(supabaseUser, sector.id);

  // Service role: authenticated insert policy requires sent_by for outbound.
  const adminDb = createAdminClient();
  return backfillKapsoMessagesPage(adminDb, {
    phoneNumberId: connection?.kapso_phone_number_id,
    dryRun: input?.dryRun ?? false,
    after: input?.after ?? null,
    limit: input?.limit ?? 20,
  });
}
