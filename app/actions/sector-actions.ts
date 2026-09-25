"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/require-member";
import {
  listMembershipSectors,
  setActiveSectorCookie,
} from "@/lib/sectors/active-sector";
import { createClient } from "@/lib/supabase/server";

/** Form action for `/select-sector` (post-login chooser). */
export async function setActiveSectorAction(formData: FormData): Promise<void> {
  const sectorId = String(formData.get("sectorId") ?? "").trim();
  const ok = await persistActiveSector(sectorId);
  if (!ok) {
    redirect("/select-sector");
  }
  redirect("/");
}

/**
 * In-app switcher: set cookie + revalidate; caller must hard-navigate (`window.location`)
 * so Realtime channels and client cache remount clean.
 */
export async function switchActiveSectorAction(
  sectorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ok = await persistActiveSector(sectorId);
  if (!ok) {
    return { ok: false, error: "invalid_sector" };
  }
  return { ok: true };
}

async function persistActiveSector(sectorId: string): Promise<boolean> {
  const trimmed = sectorId.trim();
  if (!trimmed) return false;

  const { profile } = await requireActiveProfile();
  const supabase = await createClient();
  const sectors = await listMembershipSectors(supabase, profile.id);
  const matched = sectors.find((s) => s.id === trimmed);
  if (!matched) return false;

  await setActiveSectorCookie(matched.id);
  revalidatePath("/", "layout");
  return true;
}
