"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SectorSwitcher } from "@/app/components/inbox/sector-switcher";
import { signOut } from "@/app/login/actions";
import type { SectorRow } from "@/lib/sectors/connection";
import type { Profile } from "@/lib/supabase/types";

type Props = {
  profile: Profile;
  channelStatus: string | null;
  sector: SectorRow;
  memberships: SectorRow[];
};

export function InboxHeader({
  profile,
  channelStatus,
  sector,
  memberships,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const name =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    profile.slug;
  const showSwitcher = memberships.length > 1;

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      const root = document.getElementById("inbox-header-mobile-menu");
      if (root && !root.contains(t)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="safe-pad-top z-30 shrink-0 border-b border-[color-mix(in_srgb,var(--color-border)_12%,transparent)] bg-[var(--color-bg-surface)]">
      <div className="safe-pad-x mx-auto flex max-w-6xl items-center justify-between gap-3 py-2.5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center active:opacity-80"
          >
            <svg
              className="h-8 w-auto sm:h-9"
              viewBox="0 0 32 32"
              fill="none"
              aria-hidden
            >
              <rect width="32" height="32" rx="6" fill="currentColor" />
              <path
                d="M8 12h16M8 16h12M8 20h8"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </Link>
          <div className="min-w-0">
            <p className="font-heading text-base font-bold leading-tight text-[var(--color-text-primary)] sm:text-lg">
              WhatsApp CRM
            </p>
            <p className="truncate text-xs text-[var(--color-text-muted)]">
              {name} · {sector.display_name} · {profile.role}
              {channelStatus ? ` · channel ${channelStatus}` : ""}
            </p>
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {showSwitcher ? (
            <SectorSwitcher
              sectors={memberships}
              activeSectorId={sector.id}
            />
          ) : null}
          {profile.role === "admin" ? (
            <>
              <Link
                href="/settings/users"
                className="btn inline-flex min-h-11 items-center px-3 py-1.5 text-sm"
              >
                Users
              </Link>
              <Link
                href="/settings/whatsapp"
                className="btn inline-flex min-h-11 items-center px-3 py-1.5 text-sm"
              >
                Channel
              </Link>
            </>
          ) : null}
          <form action={signOut}>
            <button
              type="submit"
              className="btn inline-flex min-h-11 items-center px-3 py-1.5 text-sm"
            >
              Sign out
            </button>
          </form>
        </div>

        <div
          id="inbox-header-mobile-menu"
          className="relative flex shrink-0 items-center gap-2 sm:hidden"
        >
          {showSwitcher ? (
            <SectorSwitcher
              sectors={memberships}
              activeSectorId={sector.id}
              triggerLabel="Account"
            />
          ) : null}
          <button
            type="button"
            className="btn inline-flex h-11 w-11 touch-manipulation items-center justify-center p-0"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((v) => !v)}
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
              {menuOpen ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </>
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-border)_14%,transparent)] bg-[var(--color-bg-surface)] shadow-lg"
            >
              {profile.role === "admin" ? (
                <>
                  <Link
                    href="/settings/users"
                    role="menuitem"
                    className="flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--color-text-primary)] active:bg-[color-mix(in_srgb,var(--color-accent)_10%,white)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    Users
                  </Link>
                  <Link
                    href="/settings/whatsapp"
                    role="menuitem"
                    className="flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--color-text-primary)] active:bg-[color-mix(in_srgb,var(--color-accent)_10%,white)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    Channel
                  </Link>
                </>
              ) : null}
              <form action={signOut}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex min-h-11 w-full items-center px-3 text-left text-sm font-semibold text-[var(--color-text-primary)] active:bg-[color-mix(in_srgb,var(--color-accent)_10%,white)]"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}