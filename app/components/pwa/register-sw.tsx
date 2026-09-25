"use client";

import { useEffect } from "react";

const READY_TIMEOUT_MS = 4_000;

/**
 * Registers `/sw.js` early. Does not await `serviceWorker.ready` unbound —
 * iOS can hang on ready forever.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    async function register() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        if (cancelled) return;

        // Soft wait for ready (optional); never block UI on hang.
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), READY_TIMEOUT_MS),
          ),
        ]);
        void reg;
      } catch {
        // Installability still works with manifest alone on some browsers;
        // SW failure must not break the CRM.
      }
    }

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
