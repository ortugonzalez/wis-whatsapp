"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { forwardMessage } from "@/app/actions/message-actions";

export type ForwardTarget = {
  id: string;
  contact_name: string;
  kind: "direct" | "group";
  title: string | null;
};

type Props = {
  open: boolean;
  sourceConversationId: string;
  messageId: string;
  targets: ForwardTarget[];
  channelConnected: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function ForwardPicker({
  open,
  sourceConversationId,
  messageId,
  targets,
  channelConnected,
  onClose,
  onSuccess,
}: Props) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setQuery("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets
      .filter((t) => t.id !== sourceConversationId)
      .filter((t) => {
        if (!q) return true;
        const label =
          t.kind === "group"
            ? t.title || t.contact_name
            : t.contact_name;
        return label.toLowerCase().includes(q);
      });
  }, [targets, sourceConversationId, query]);

  if (!open) return null;

  function pick(targetId: string) {
    if (!channelConnected || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await forwardMessage({
        messageId,
        sourceConversationId,
        targetConversationId: targetId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card-institucional flex max-h-[min(70vh,520px)] w-full max-w-md flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[color-mix(in_srgb,var(--color-gris)_16%,transparent)] px-4 py-3">
          <h2 id={titleId} className="font-heading text-base font-bold">
            Reenviar a…
          </h2>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar chat"
            className="mt-2 w-full rounded-xl border border-[color-mix(in_srgb,var(--color-gris)_22%,transparent)] px-3 py-2 text-sm outline-none focus:border-[var(--color-teal)]"
            autoFocus
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-sm text-[var(--text-secondary)]">
              No hay chats disponibles.
            </li>
          ) : (
            filtered.map((t) => {
              const label =
                t.kind === "group"
                  ? t.title || t.contact_name
                  : t.contact_name;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={!channelConnected || pending}
                    className="flex w-full rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--color-teal)_10%,white)] disabled:opacity-50"
                    onClick={() => pick(t.id)}
                  >
                    <span className="font-medium">{label}</span>
                    {t.kind === "group" ? (
                      <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                        Grupo
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {error ? (
          <p className="px-4 pb-3 text-sm text-[var(--color-naranja)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="border-t border-[color-mix(in_srgb,var(--color-gris)_16%,transparent)] px-4 py-3">
          <button
            type="button"
            className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--color-teal)]"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
