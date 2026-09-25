import { NextResponse } from "next/server";
import {
  listMembershipSectors,
  setActiveSectorCookie,
} from "@/lib/sectors/active-sector";
import { requireActiveProfile } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

/**
 * Persist active-sector cookie when RSC cannot Set-Cookie (single membership).
 * Validates membership then redirects to inbox.
 */
export async function GET(request: Request) {
  const { profile } = await requireActiveProfile();
  const url = new URL(request.url);
  const sectorId = (url.searchParams.get("sectorId") ?? "").trim();

  if (!sectorId) {
    return NextResponse.redirect(new URL("/select-sector", url.origin));
  }

  const supabase = await createClient();
  const sectors = await listMembershipSectors(supabase, profile.id);
  const matched = sectors.find((s) => s.id === sectorId);
  if (!matched) {
    return NextResponse.redirect(new URL("/select-sector", url.origin));
  }

  await setActiveSectorCookie(matched.id);
  return NextResponse.redirect(new URL("/", url.origin));
}
