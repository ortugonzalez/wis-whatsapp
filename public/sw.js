/* Service worker — installable PWA shell (no Web Push).
 *
 * Strategy:
 * - Precache app shell assets (icons, offline fallback).
 * - Network-first for same-origin navigations; fall back to /offline.html.
 * - Never cache Supabase, auth, or API responses.
 */

const CACHE = "whatsapp-crm-shell-v1";
const PRECACHE = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/brand/logo-wordmark-naranja.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => {
      return self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function shouldBypass(url) {
  const host = url.hostname;
  // Supabase / Realtime / Auth — never cache
  if (host.includes("supabase.co")) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/auth/")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (shouldBypass(url)) return;

  // Same-origin navigations: network-first → offline shell
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => res)
        .catch(() => caches.match("/offline.html")),
    );
    return;
  }

  // Same-origin static: stale-while-revalidate for precached paths only
  if (url.origin === self.location.origin) {
    const path = url.pathname;
    const isShell =
      path.startsWith("/icons/") ||
      path.startsWith("/brand/") ||
      path === "/offline.html" ||
      path === "/manifest.webmanifest" ||
      path === "/sw.js";

    if (!isShell) return;

    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) void cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
