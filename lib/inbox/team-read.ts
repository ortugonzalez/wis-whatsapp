export function isWaUnreadLabelName(name: string): boolean {
  return name
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .includes("NO LEID");
}

export function isInboundTeamUnread(
  createdAt: string,
  teamReadAt: string | null | undefined,
): boolean {
  if (!teamReadAt) return false;
  return createdAt > teamReadAt;
}

export function crmUnreadCountFromQuery(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 9999);
}

export function formatUnreadBadge(n: number): string {
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}

/** Badge only when WA unread label is on; count from cursor, min 1 if labeled. */
export function badgeCountForChat(input: {
  hasWaUnreadLabel: boolean;
  cursorUnreadCount: number;
}): number {
  if (!input.hasWaUnreadLabel) return 0;
  return Math.max(1, input.cursorUnreadCount);
}

export function formatProfileDisplayName(
  p:
    | {
        first_name?: string | null;
        last_name?: string | null;
        slug?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!p) return null;
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return name || p.slug || null;
}

export type TeamReadVia = "crm" | "whatsapp";

export function teamReadAttribution(input: {
  via: TeamReadVia | null | undefined;
  readerName: string | null | undefined;
}): string | null {
  if (input.via === "crm" && input.readerName) {
    return `Leído por ${input.readerName}`;
  }
  if (input.via === "whatsapp") {
    return "Leído desde el teléfono";
  }
  return null;
}

export function teamReadFromConversationRow(row: {
  team_read_at?: string | null;
  team_read_by?: string | null;
  team_read_via?: string | null;
}): {
  team_read_at: string | null;
  team_read_by: string | null;
  team_read_via: TeamReadVia | null;
} {
  const via =
    row.team_read_via === "crm" || row.team_read_via === "whatsapp"
      ? row.team_read_via
      : null;
  return {
    team_read_at: row.team_read_at ?? null,
    team_read_by: row.team_read_by ?? null,
    team_read_via: via,
  };
}

export function unreadCountMapFromRpc(
  rows: { conversation_id?: string; unread_count?: number }[] | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    if (!row.conversation_id) continue;
    map.set(row.conversation_id, crmUnreadCountFromQuery(row.unread_count));
  }
  return map;
}

export const CRM_HOLD_UNREAD_EVENT = "crm-hold-unread";

const HOLD_KEY_PREFIX = "crm-hold-unread:";
const HOLD_MS = 120_000;

export function holdTeamUnread(conversationId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      `${HOLD_KEY_PREFIX}${conversationId}`,
      String(Date.now() + HOLD_MS),
    );
  } catch {
    // ignore quota / private mode
  }
  window.dispatchEvent(
    new CustomEvent(CRM_HOLD_UNREAD_EVENT, {
      detail: { conversationId },
    }),
  );
}

export function isTeamUnreadHeld(conversationId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(`${HOLD_KEY_PREFIX}${conversationId}`);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || Date.now() > until) {
      sessionStorage.removeItem(`${HOLD_KEY_PREFIX}${conversationId}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearTeamUnreadHold(conversationId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`${HOLD_KEY_PREFIX}${conversationId}`);
  } catch {
    // ignore
  }
}
