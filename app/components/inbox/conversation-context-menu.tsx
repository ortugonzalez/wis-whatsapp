"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  createSectorLabel,
  loadConversationLabelsPanel,
  toggleConversationLabel,
  type SectorLabelRow,
} from "@/app/actions/label-actions";
import { markConversationUnread } from "@/app/actions/team-read-actions";
import { holdTeamUnread } from "@/lib/inbox/team-read";

type MenuState = {
  x: number;
  y: number;
  conversationId: string;
};

type PanelView = "root" | "lists" | "new";

function clampMenuPosition(x: number, y: number, w: number, h: number) {
  const pad = 8;
  const maxX = window.innerWidth - w - pad;
  const maxY = window.innerHeight - h - pad;
  return {
    x: Math.max(pad, Math.min(x, maxX)),
    y: Math.max(pad, Math.min(y, maxY)),
  };
}

export function ConversationContextMenuLayer() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [view, setView] = useState<PanelView>("root");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [writeEnabled, setWriteEnabled] = useState(true);
  const [labels, setLabels] = useState<SectorLabelRow[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(() => new Set());
  const [newName, setNewName] = useState("");
  const [loadingLists, setLoadingLists] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    function onMenu(e: Event) {
      const detail = (e as CustomEvent<MenuState>).detail;
      if (!detail?.conversationId) return;
      setError(null);
      setView("root");
      setNewName("");
      setLabels([]);
      setAssigned(new Set());
      setLoadingLists(false);
      activeConversationIdRef.current = detail.conversationId;
      setMenu(detail);
    }
    window.addEventListener("inbox-conversation-menu", onMenu);
    return () =>
      window.removeEventListener("inbox-conversation-menu", onMenu);
  }, []);

  useEffect(() => {
    if (!menu) {
      activeConversationIdRef.current = null;
    }
  }, [menu]);

  useEffect(() => {
    if (!menu) return;

    let remove: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      function onPointerDown(e: PointerEvent) {
        if (!menuRef.current?.contains(e.target as Node)) {
          setMenu(null);
        }
      }
      function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") {
          if (view === "new") {
            setView("lists");
            setNewName("");
            setError(null);
            return;
          }
          if (view === "lists") {
            setView("root");
            setError(null);
            return;
          }
          setMenu(null);
        }
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
  }, [menu, view]);

  function openLists() {
    if (!menu || loadingLists || pending) return;
    const conversationId = menu.conversationId;
    setError(null);
    setLoadingLists(true);
    startTransition(async () => {
      try {
        const result = await loadConversationLabelsPanel(conversationId);
        if (activeConversationIdRef.current !== conversationId) return;
        setLoadingLists(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setWriteEnabled(result.writeEnabled);
        setLabels(result.labels);
        setAssigned(new Set(result.assignedIds));
        setView("lists");
      } catch {
        if (activeConversationIdRef.current !== conversationId) return;
        setLoadingLists(false);
        setError("No se pudieron cargar las listas.");
      }
    });
  }

  function toggleLabel(label: SectorLabelRow) {
    if (!menu || !writeEnabled || pending) return;
    const conversationId = menu.conversationId;
    const nextOn = !assigned.has(label.id);
    setError(null);
    startTransition(async () => {
      const result = await toggleConversationLabel({
        conversationId,
        labelId: label.id,
        waLabelId: label.wa_label_id,
        assign: nextOn,
      });
      if (activeConversationIdRef.current !== conversationId) return;
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
    });
  }

  function submitNewList() {
    if (!menu || !writeEnabled || pending) return;
    const conversationId = menu.conversationId;
    const name = newName.trim();
    if (!name) {
      setError("Escribí un nombre para la lista.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createSectorLabel(name);
      if (activeConversationIdRef.current !== conversationId) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLabels((prev) => {
        if (prev.some((l) => l.id === result.label.id)) return prev;
        return [...prev, result.label].sort((a, b) =>
          a.name.localeCompare(b.name, "es"),
        );
      });
      setNewName("");
      setView("lists");
    });
  }

  if (!menu) return null;

  const panelW = view === "root" ? 220 : 280;
  const panelH = view === "root" ? 100 : 360;
  const pos = clampMenuPosition(menu.x, menu.y, panelW, panelH);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Acciones del chat"
      aria-labelledby={view !== "root" ? titleId : undefined}
      className="fixed z-40 flex max-h-[min(70dvh,24rem)] min-w-[200px] flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-gris)_18%,transparent)] bg-[var(--bg-surface)] shadow-lg"
      style={{ left: pos.x, top: pos.y, width: panelW }}
    >
      {view === "root" ? (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={pending || loadingLists}
            className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm text-[var(--text-primary)] touch-manipulation hover:bg-[color-mix(in_srgb,var(--color-teal)_10%,white)] active:bg-[color-mix(in_srgb,var(--color-teal)_14%,white)] disabled:opacity-45"
            onClick={openLists}
          >
            Agregar a lista
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm text-[var(--text-primary)] touch-manipulation hover:bg-[color-mix(in_srgb,var(--color-teal)_10%,white)] active:bg-[color-mix(in_srgb,var(--color-teal)_14%,white)] disabled:opacity-45"
            onClick={() => {
              setError(null);
              holdTeamUnread(menu.conversationId);
              startTransition(async () => {
                const result = await markConversationUnread(menu.conversationId);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setMenu(null);
              });
            }}
          >
            Marcar como no leído
          </button>
        </>
      ) : null}

      {view === "lists" ? (
        <>
          <div className="flex items-center justify-between gap-2 border-b border-[color-mix(in_srgb,var(--color-gris)_10%,transparent)] px-3 py-2">
            <h2
              id={titleId}
              className="font-heading text-sm font-bold text-[var(--text-primary)]"
            >
              Agregar a lista
            </h2>
            <button
              type="button"
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--color-naranja)]"
              aria-label="Volver"
              onClick={() => {
                setView("root");
                setError(null);
              }}
            >
              ←
            </button>
          </div>
          <p className="px-3 pt-2 text-[11px] text-[var(--text-muted)]">
            {writeEnabled
              ? "Activá o desactivá para agregar o quitar este chat."
              : "Solo lectura: la escritura a WhatsApp está deshabilitada."}
          </p>
          {labels.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--text-secondary)]">
              No hay listas todavía. Creá una con + Nueva lista.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin]">
              {labels.map((label) => {
                const on = assigned.has(label.id);
                return (
                  <li key={label.id}>
                    <label
                      className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-teal)_8%,transparent)] ${
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
                          className={`block h-5 w-9 rounded-full transition-colors ${
                            on
                              ? "bg-[var(--color-teal)]"
                              : "bg-[color-mix(in_srgb,var(--color-gris)_28%,transparent)]"
                          }`}
                        />
                        <span
                          aria-hidden
                          className={`pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                            on ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-[color-mix(in_srgb,var(--color-gris)_10%,transparent)] py-1">
            <button
              type="button"
              role="menuitem"
              disabled={pending || !writeEnabled}
              className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm font-semibold text-[var(--color-teal)] touch-manipulation hover:bg-[color-mix(in_srgb,var(--color-teal)_10%,white)] disabled:opacity-45"
              onClick={() => {
                setError(null);
                setNewName("");
                setView("new");
              }}
            >
              + Nueva lista
            </button>
          </div>
        </>
      ) : null}

      {view === "new" ? (
        <div className="flex flex-col gap-2 p-3">
          <h2
            id={titleId}
            className="font-heading text-sm font-bold text-[var(--text-primary)]"
          >
            Nueva lista
          </h2>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-primary)]">
            Nombre
            <input
              type="text"
              value={newName}
              maxLength={100}
              autoFocus
              disabled={pending}
              className="min-h-11 rounded-xl border border-[color-mix(in_srgb,var(--color-gris)_22%,transparent)] bg-[var(--bg-base)] px-3 text-sm font-normal outline-none focus:border-[var(--color-teal)]"
              placeholder="Ej. Cobranzas"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNewList();
                }
              }}
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="min-h-11 flex-1 rounded-xl border border-[color-mix(in_srgb,var(--color-gris)_18%,transparent)] text-sm touch-manipulation"
              disabled={pending}
              onClick={() => {
                setView("lists");
                setNewName("");
                setError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-institucional min-h-11 flex-1 px-3 text-sm disabled:opacity-45"
              disabled={pending || !writeEnabled}
              onClick={submitNewList}
            >
              Crear
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="border-t border-[color-mix(in_srgb,var(--color-gris)_10%,transparent)] px-3 py-2 text-[11px] text-[var(--color-naranja)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function openConversationContextMenu(state: MenuState) {
  window.dispatchEvent(
    new CustomEvent("inbox-conversation-menu", { detail: state }),
  );
}
