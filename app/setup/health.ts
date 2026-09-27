export type SetupState = "missing_configuration" | "local_unavailable" | "local_ready" | "remote_configured";

/** Local readiness only: never probe a remote URL or disclose environment values. */
export async function getSetupState(): Promise<SetupState> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "missing_configuration";
  let base: URL;
  try { base = new URL(url); } catch { return "missing_configuration"; }
  if (!["http:", "https:"].includes(base.protocol)) return "missing_configuration";
  if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) return "remote_configured";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const results = await Promise.all([
      fetch(new URL("/auth/v1/health", base), {headers:{apikey:key}, signal:controller.signal, cache:"no-store", redirect:"error"}),
      fetch(new URL("/rest/v1/", base), {method:"HEAD",headers:{apikey:key,Authorization:`Bearer ${key}`},signal:controller.signal,cache:"no-store",redirect:"error"}),
    ]);
    return results.every(result => result.ok) ? "local_ready" : "local_unavailable";
  } catch { return "local_unavailable"; }
  finally { clearTimeout(timer); }
}
