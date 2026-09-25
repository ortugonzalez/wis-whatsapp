import { NextResponse } from "next/server";
import {
  clearActiveSectorCookie,
  listMembershipSectors,
  setActiveSectorCookie,
} from "@/lib/sectors/active-sector";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function redirectTo(origin: string, path: string, request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${path}`);
  }
  if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${path}`);
  }
  return NextResponse.redirect(`${origin}${path}`);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/";
  // Only same-origin relative paths; reject protocol-relative "//…"
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const { error: linkError } = await supabase.rpc("link_my_profile");

  if (linkError) {
    const userId = user.id;
    await supabase.auth.signOut();
    try {
      const admin = createAdminClient();
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // Best-effort cleanup of non-allowlisted Auth user.
    }
    return NextResponse.redirect(`${origin}/login?error=unauthorized`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!profile) {
    return NextResponse.redirect(`${origin}/login?error=unauthorized`);
  }

  const sectors = await listMembershipSectors(supabase, profile.id);

  if (sectors.length === 0) {
    await clearActiveSectorCookie();
    return redirectTo(origin, "/login?error=no_sector", request);
  }

  if (sectors.length === 1) {
    await setActiveSectorCookie(sectors[0].id);
    return redirectTo(origin, next, request);
  }

  // >1: force choose-on-login (no sticky sector across OAuth sessions).
  await clearActiveSectorCookie();
  return redirectTo(origin, "/select-sector", request);
}
