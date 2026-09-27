import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSetupState } from "@/app/setup/health";

export async function updateSession(request: NextRequest) {
  // API v1 performs its own scoped Bearer/session authorization and returns JSON.
  if (request.nextUrl.pathname.startsWith("/api/v1/")) {
    return NextResponse.next({ request });
  }
  if (request.nextUrl.pathname === "/setup") return NextResponse.next({request});
  const setupState = await getSetupState();
  if (setupState === "missing_configuration" || setupState === "local_unavailable") {
    const setupUrl = request.nextUrl.clone();
    setupUrl.pathname = "/setup";
    setupUrl.search = "";
    return NextResponse.redirect(setupUrl);
  }
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicAuth =
    path.startsWith("/login") || path.startsWith("/auth");
  // Kapso CRM ingress: HMAC on the route; must not require a browser session.
  const isPublicWebhook = path.startsWith("/api/webhooks/kapso");

  const redirectWithSession = (url: URL) => {
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  };

  if (!user && !isPublicAuth && !isPublicWebhook) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithSession(url);
  }

  let activeProfile: { id: string } | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    activeProfile = profile;

    if (!activeProfile && !isPublicAuth && !isPublicWebhook) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "unauthorized");
      return redirectWithSession(url);
    }
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    if (!activeProfile) {
      await supabase.auth.signOut();
      url.pathname = "/login";
      url.searchParams.set("error", "unauthorized");
      return redirectWithSession(url);
    }
    url.pathname = "/dashboard";
    return redirectWithSession(url);
  }

  return supabaseResponse;
}
