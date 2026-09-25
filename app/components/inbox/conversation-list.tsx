"use client";

import Link from "next/link";
import { ContactAvatar } from "@/app/components/inbox/contact-avatar";
import { openConversationContextMenu } from "@/app/components/inbox/conversation-context-menu";
import { DeliveryTicks } from "@/app/components/inbox/delivery-ticks";
import { OverflowReveal } from "@/app/components/inbox/overflow-reveal";
import { formatInboxDateTime } from "@/lib/inbox/format-datetime";
import { formatUnreadBadge } from "@/lib/inbox/team-read";
import type { DeliveryStatus, MessageDirection } from "@/lib/supabase/types";

/** Visible WA/CRM list labels on a row (excludes system «No leídos»). */
export type ConversationListLabel = {
  id: string;
  name: string;
  color?: string | null;
};

export type ConversationListItem = {
  id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  contact_name: string;
  phone_e164: string | null;
  avatar_url?: string | null;
  last_direction?: MessageDirection | null;
  last_delivery_status?: DeliveryStatus | null;
  kind: "direct" | "group";
  title?: string | null;
  unread_count?: number;
  labels?: ConversationListLabel[];
};

/** WhatsApp Business label color indices → hex (Baileys stores index as string). */
const WA_LABEL_COLORS = [
  "#ff9485",
  "#64c4ff",
  "#ffd429",
  "#dfaef0",
  "#99b6c1",
  "#55ccb3",
  "#ff9dff",
  "#d3a91d",
  "#6d7cce",
  "#d7e752",
  "#00d0e1",
  "#ffc5c7",
  "#93ce93",
  "#f979a9",
  "#9ba6ff",
  "#738f94",
] as const;

function labelAccent(color: string | null | undefined): string {
  if (!color) return "var(--color-teal)";
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  const idx = Number(trimmed);
  if (Number.isInteger(idx) && idx >= 0 && idx < WA_LABEL_COLORS.length) {
    return WA_LABEL_COLORS[idx]!;
  }
  return "var(--color-teal)";
}

type Props = {
  rows: ConversationListItem[];
  activeId?: string;
  emptyTitle?: string;
  emptyBody?: string;
};

function formatWhen(iso: string | null): string {
  return formatInboxDateTime(iso);
}

function MoreIcon() {
  return (
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
  );
}

function openMenuAt(
  conversationId: string,
  x: number,
  y: number,
) {
  openConversationContextMenu({ x, y, conversationId });
}

function ConversationRow({
  row,
  active,
}: {
  row: ConversationListItem;
  active: boolean;
}) {
  const showTicks = row.last_direction === "out" && row.last_delivery_status;
  const displayName =
    row.kind === "group" ? row.title?.trim() || "Grupo" : row.contact_name;
  const unread = row.unread_count ?? 0;
  const badge = formatUnreadBadge(unread);
  const labels = row.labels ?? [];

  const rowTone = active
    ? "bg-[color-mix(in_srgb,var(--color-teal)_12%,transparent)]"
    : "";

  return (
    <li
      className={`flex min-h-14 items-stretch ${rowTone}`}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenuAt(row.id, e.clientX, e.clientY);
      }}
    >
      <Link
        href={`/c/${row.id}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3 touch-manipulation transition-colors active:bg-[color-mix(in_srgb,var(--color-teal)_14%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-teal)_8%,transparent)]"
      >
        <ContactAvatar
          name={displayName}
          avatarUrl={row.kind === "group" ? null : row.avatar_url}
          size="xs"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <OverflowReveal
              as="p"
              text={displayName}
              className="min-w-0 truncate text-sm font-heading font-semibold leading-tight"
            >
              {row.kind === "group" ? (
                <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-teal)]">
                  Grupo
                </span>
              ) : null}
              {displayName}
            </OverflowReveal>
            <time className="shrink-0 text-[10px] leading-none text-[var(--text-muted)]">
              {formatWhen(row.last_message_at)}
            </time>
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs leading-snug text-[var(--text-secondary)]">
            {showTicks ? (
              <DeliveryTicks status={row.last_delivery_status!} />
            ) : null}
            <OverflowReveal
              text={row.last_message_preview || "—"}
              className={`min-w-0 truncate ${
                unread > 0 ? "font-semibold text-[var(--text-primary)]" : ""
              }`}
            />
          </p>
          {labels.length > 0 ? (
            <ul className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
              {labels.map((label) => {
                const accent = labelAccent(label.color);
                return (
                  <li key={label.id} className="min-w-0 max-w-full">
                    <OverflowReveal
                      text={label.name}
                      className="inline-flex min-w-0 max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                      style={{
                        color: accent,
                        backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`,
                      }}
                    >
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                      <span className="truncate">{label.name}</span>
                    </OverflowReveal>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        {badge ? (
          <span
            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-naranja)] px-1 text-[10px] font-bold leading-none text-white"
            aria-label={`${unread} no leídos por el equipo`}
          >
            {badge}
          </span>
        ) : null}
      </Link>
      <button
        type="button"
        className="inline-flex h-auto min-h-14 w-11 shrink-0 items-center justify-center text-[var(--text-muted)] touch-manipulation transition-colors hover:text-[var(--color-teal)] active:bg-[color-mix(in_srgb,var(--color-teal)_12%,transparent)] active:text-[var(--color-teal)]"
        aria-label={`Opciones de ${displayName}`}
        aria-haspopup="menu"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          openMenuAt(row.id, rect.right - 8, rect.bottom - 4);
        }}
      >
        <MoreIcon />
      </button>
    </li>
  );
}

export function ConversationList({
  rows,
  activeId,
  emptyTitle = "Sin conversaciones todavía",
  emptyBody = "Cuando un vecino escriba al número institucional, el chat aparece acá.",
}: Props) {
  if (rows.length === 0) {
    return (
      <div className="inbox-scroll-host card-institucional min-h-0 flex-1">
        <div className="inbox-scroll p-6 text-sm text-[var(--text-secondary)]">
          <p className="font-heading text-base font-semibold text-[var(--text-primary)]">
            {emptyTitle}
          </p>
          <p className="mt-2">{emptyBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="inbox-scroll-host min-h-0 flex-1 basis-0 rounded-2xl border border-[color-mix(in_srgb,var(--color-gris)_12%,transparent)] bg-[var(--bg-surface)]">
      <ul className="inbox-scroll divide-y divide-[color-mix(in_srgb,var(--color-gris)_10%,transparent)]">
        {rows.map((row) => (
          <ConversationRow
            key={row.id}
            row={row}
            active={row.id === activeId}
          />
        ))}
      </ul>
    </div>
  );
}
