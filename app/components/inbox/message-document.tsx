"use client";

import { OverflowReveal } from "@/app/components/inbox/overflow-reveal";
import { useSignedMediaUrl } from "@/lib/storage/use-signed-media-url";

type Props = {
  path: string;
  label?: string | null;
};

function displayName(label: string | null | undefined, path: string): string {
  const fromLabel = label?.trim();
  if (fromLabel) return fromLabel;
  const base = path.split("/").pop();
  return base || "Documento";
}

/** Download link for inbound/outbound documents (private bucket). */
export function MessageDocument({ path, label }: Props) {
  const { url, error, loading } = useSignedMediaUrl(path);
  const name = displayName(label, path);

  if (error) {
    return <p className="text-xs text-[var(--danger)]">{error}</p>;
  }
  if (loading || !url) {
    return (
      <p className="text-xs text-[var(--text-muted)]" aria-live="polite">
        Cargando documento…
      </p>
    );
  }

  return (
    <a
      href={url}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--color-teal)_25%,white)] bg-white/60 px-2.5 py-1.5 text-sm font-medium text-[var(--color-teal)] hover:border-[var(--color-naranja)] hover:text-[var(--color-naranja)]"
    >
      <span aria-hidden="true" className="shrink-0">
        📄
      </span>
      <OverflowReveal text={name} className="min-w-0 truncate" />
    </a>
  );
}
