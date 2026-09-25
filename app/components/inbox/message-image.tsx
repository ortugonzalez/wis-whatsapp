"use client";

import { useSignedMediaUrl } from "@/lib/storage/use-signed-media-url";

type Props = {
  path: string;
  caption?: string | null;
};

/** Preview + open/download for inbound/outbound images (private bucket). */
export function MessageImage({ path, caption }: Props) {
  const { url, error, loading } = useSignedMediaUrl(path);

  if (error) {
    return <p className="text-xs text-[var(--danger)]">{error}</p>;
  }
  if (loading || !url) {
    return (
      <p className="text-xs text-[var(--text-muted)]" aria-live="polite">
        Cargando imagen…
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-lg"
        aria-label={caption ? `Abrir imagen: ${caption}` : "Abrir imagen"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={caption || "Imagen del mensaje"}
          className="max-h-64 max-w-full rounded-lg object-contain"
          loading="eager"
          decoding="async"
        />
      </a>
      {caption ? (
        <p className="whitespace-pre-wrap break-words text-sm">{caption}</p>
      ) : null}
    </div>
  );
}
