"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toggleConversationLabel } from "@/app/actions/label-actions";
import { markConversationUnread } from "@/app/actions/team-read-actions";
import { holdTeamUnread } from "@/lib/inbox/team-read";

export type LabelChip = {
  id: string;
  wa_label_id: string;
  name: string;
  color: string | null;
};

type Props = {
  conversationId: string;
  allLabels: LabelChip[];
  assignedIds: string[];
  writeEnabled: boolean;
  onChanged?: () => void;
};

export function ConversationLabelEditor({
  conversationId,
  allLabels,
  assignedIds,
  writeEnabled,
  onChanged,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [assigned, setAssigned] = useState(() => new Set(assignedIds));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    setAssigned(new Set(assignedIds));
  }, [assignedIds]);

  useEffect(() => {
    if (!menuOpen) return;

    let remove: (() => void) | undefined;
    // Defer so the opening click doesn't immediately close the menu.
    const timer = window.setTimeout(() => {
      function onPointerDown(e: PointerEvent) {
        if (!rootRef.current?.contains(e.target as Node)) {
          setMenuOpen(false);
        }
      }

      function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") setMenuOpen(false);
      }

      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      remove = () => {
        document.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, 0);

    return () => {
      window.clearTimeout(timer);
      remove?.();
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!modalOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setModalOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  function openListsModal() {
    setMenuOpen(false);
    setError(null);
    setModalOpen(true);
  }

  function markUnread() {
    if (pending) return;
    setError(null);
    // Hold BEFORE the server action — revalidate remounts the thread and
    // would otherwise auto mark-read and undo the WA unread write.
    holdTeamUnread(conversationId);
    startTransition(async () => {
      const result = await markConversationUnread(conversationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMenuOpen(false);
    });
  }

  function toggleLabel(label: LabelChip) {
    if (!writeEnabled || pending) return;
    const nextOn = !assigned.has(label.id);
    setError(null);
    startTransition(async () => {
      const result = await toggleConversationLabel({
        conversationId,
        labelId: label.id,
        waLabelId: label.wa_label_id,
        assign: nextOn,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAssigned((prev) => {
        const next = new Set(prev);
        if (nextOn) next.add(label.id);
        else next.delete(label.id);
        return next;
      });
      onChanged?.();
    });
  }

  return (
    <>
      <div ref={rootRef} className="relative shrink-0">
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--color-gris)_22%,transparent)] bg-[var(--bg-surface)] text-[var(--text-primary)] touch-manipulation transition-colors hover:border-[var(--color-teal)] hover:text-[var(--color-teal)] active:border-[var(--color-teal)] active:text-[var(--color-teal)]"
          aria-label="Más opciones"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="currentColor"
          >
            <circle cx="12" cy="5" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="19" r="1.75" />
          </svg>
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-gris)_14%,transparent)] bg-[var(--bg-surface)] shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-teal)_8%,transparent)]"
              onClick={openListsModal}
            >
              Agregar/quitar de listas
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-teal)_8%,transparent)] disabled:opacity-45"
              onClick={markUnread}
            >
              Marcar como no leído
            </button>
          </div>
        ) : null}
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-gris)_45%,transparent)] p-4"
          role="presentation"
          onClick={() => setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[min(80dvh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-gris)_14%,transparent)] bg-[var(--bg-surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[color-mix(in_srgb,var(--color-gris)_10%,transparent)] px-4 py-3">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="font-heading text-lg font-bold text-[var(--text-primary)]"
                >
                  Listas
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {writeEnabled
                    ? "Activá o desactivá para agregar o quitar esta conversación."
                    : "Solo lectura: la escritura a WhatsApp está deshabilitada."}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--color-naranja)]"
                aria-label="Cerrar"
                onClick={() => setModalOpen(false)}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </svg>
              </button>
            </div>

            {error ? (
              <p
                className="mx-4 mt-3 rounded-lg bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-sm text-[var(--danger)]"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            {allLabels.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">
                Todavía no llegó el catálogo de etiquetas desde WhatsApp
                Business.
              </p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2 [scrollbar-width:thin]">
                {allLabels.map((label) => {
                  const on = assigned.has(label.id);
                  return (
                    <li key={label.id}>
                      <label
                        className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--color-teal)_8%,transparent)] ${
                          !writeEnabled || pending ? "opacity-60" : ""
                        }`}
                      >
                        <span className="min-w-0 truncate text-sm font-medium">
                          {label.name}
                        </span>
                        <span className="relative inline-flex shrink-0">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={on}
                            disabled={pending || !writeEnabled}
                            onChange={() => toggleLabel(label)}
                          />
                          <span
                            aria-hidden
                            className={`block h-6 w-11 rounded-full transition-colors ${
                              on
                                ? "bg-[var(--color-teal)]"
                                : "bg-[color-mix(in_srgb,var(--color-gris)_28%,transparent)]"
                            }`}
                          />
                          <span
                            aria-hidden
                            className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              on ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t border-[color-mix(in_srgb,var(--color-gris)_10%,transparent)] px-4 py-3">
              <button
                type="button"
                className="btn-institucional w-full px-3 py-2 text-sm"
                onClick={() => setModalOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
