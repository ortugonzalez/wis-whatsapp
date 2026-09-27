"use client";

import { useEffect, useId, useState } from "react";
import { switchActiveSectorAction } from "@/app/actions/sector-actions";
import { OverflowReveal } from "@/app/components/inbox/overflow-reveal";
import type { SectorRow } from "@/lib/sectors/connection";

type Props = {
  sectors: SectorRow[];
  activeSectorId: string;
  /** Compact label for narrow chrome; defaults to active display_name. */
  triggerLabel?: string;
};

export function SectorSwitcher({
  sectors,
  activeSectorId,
  triggerLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      const root = document.getElementById(`sector-switcher-${menuId}`);
      if (root && !root.contains(t)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, menuId]);

  if (sectors.length <= 1) return null;

  const active =
    sectors.find((s) => s.id === activeSectorId) ?? sectors[0];
  const label = triggerLabel ?? active.display_name;

  async function onPick(sectorId: string) {
    if (sectorId === activeSectorId || pending) {
      setOpen(false);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await switchActiveSectorAction(sectorId);
      if (!result.ok) {
        setError("No se pudo cambiar de sector.");
        setPending(false);
        return;
      }
      // Hard navigate: remount Realtime + drop client inbox cache.
      window.location.assign(new URL("/", window.location.href).href);
    } catch {
      setError("No se pudo cambiar de sector.");
      setPending(false);
    }
  }

  return (
    <div id={`sector-switcher-${menuId}`} className="relative">
      <button
        type="button"
        className="btn-institucional inline-flex min-h-11 max-w-[14rem] touch-manipulation items-center gap-1.5 truncate px-3 py-1.5 text-sm"
        aria-label="Cambiar cuenta"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
      >
        <OverflowReveal
          text={pending ? "Cambiando…" : label}
          className="min-w-0 truncate"
        />
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 opacity-70"
          fill="currentColor"
        >
          <path d="M5.25 7.5L10 12.25 14.75 7.5H5.25z" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,16rem)] overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-gris)_14%,transparent)] bg-[var(--bg-surface)] shadow-lg"
        >
          {sectors.map((sector) => {
            const isActive = sector.id === activeSectorId;
            return (
              <button
                key={sector.id}
                type="button"
                role="menuitem"
                disabled={pending}
                className="flex min-h-11 w-full touch-manipulation items-center px-3 text-left text-sm font-semibold text-[var(--text-primary)] active:bg-[color-mix(in_srgb,var(--color-teal)_10%,white)] disabled:opacity-60"
                onClick={() => onPick(sector.id)}
              >
                <OverflowReveal
                  text={sector.display_name}
                  className="min-w-0 flex-1 truncate"
                />
                {isActive ? (
                  <span className="ml-2 shrink-0 text-xs font-normal text-[var(--text-muted)]">
                    Activo
                  </span>
                ) : null}
              </button>
            );
          })}
          {error ? (
            <p
              className="border-t border-[color-mix(in_srgb,var(--color-gris)_12%,transparent)] px-3 py-2 text-xs text-[var(--danger)]"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
