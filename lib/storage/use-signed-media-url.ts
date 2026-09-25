"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { WHATSAPP_MEDIA_BUCKET } from "@/lib/supabase/types";

/** Client-side signed URL for private whatsapp-media objects (authenticated RLS). */
export function useSignedMediaUrl(
  path: string | null | undefined,
  expiresSec = 3600,
) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    void (async () => {
      const { data, error: signErr } = await supabase.storage
        .from(WHATSAPP_MEDIA_BUCKET)
        .createSignedUrl(path, expiresSec);
      if (cancelled) return;
      setLoading(false);
      if (signErr || !data?.signedUrl) {
        setError("No se pudo cargar el archivo.");
        return;
      }
      setUrl(data.signedUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [path, expiresSec]);

  return { url, error, loading };
}
