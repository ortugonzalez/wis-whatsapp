import { headers } from "next/headers";

function isLocalHost(host: string): boolean {
  const h = host.split(":")[0]?.toLowerCase() ?? "";
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.endsWith(".local")
  );
}

/**
 * Public origin for OAuth redirects. Prefer the request host (Vercel preview /
 * production) so PKCE cookies and redirectTo share the same site. SITE_URL is
 * a local/dev fallback only.
 *
 * Proto must be `http` for local hosts — defaulting to `https` makes
 * `redirectTo` miss the Supabase allowlist and Auth falls back to the
 * dashboard Site URL (production).
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const host = forwardedHost ?? h.get("host");
  const forwardedProto = h.get("x-forwarded-proto");

  if (host) {
    const proto =
      forwardedProto ??
      (isLocalHost(host) || process.env.NODE_ENV === "development"
        ? "http"
        : "https");
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
