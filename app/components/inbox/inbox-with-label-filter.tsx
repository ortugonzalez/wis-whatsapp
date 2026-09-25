"use client";

import { reconcileKapsoUnreadFromPlatform } from "@/app/actions/kapso-unread-reconcile";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { LabelChip } from "@/app/components/inbox/label-chips";
import {
  ConversationList,
  type ConversationListItem,
} from "@/app/components/inbox/conversation-list";
import { ConversationContextMenuLayer } from "@/app/components/inbox/conversation-context-menu";
import { NewChatButton } from "@/app/components/inbox/new-chat-button";
import { createClient } from "@/lib/supabase/client";
import { computeDisplayName } from "@/lib/contacts/display-name";
import {
  CONVERSATION_LIST_SELECT,
  lastMessageMetaFromEmbed,
} from "@/lib/inbox/last-message-meta";
import { dedupeDirectConversationsByPhone } from "@/lib/inbox/dedupe-conversations";
import {
  badgeCountForChat,
  isWaUnreadLabelName,
  unreadCountMapFromRpc,
} from "@/lib/inbox/team-read";
import {
  ensureInboundSoundUnlockWired,
  playInboundSound,
  readInboundSoundPref,
  shouldPlayInboundSound,
  unlockInboundSound,
  writeInboundSoundPref,
  type InboundSoundPref,
} from "@/lib/inbox/inbound-sound";
import type { ChannelProvider } from "@/lib/sectors/connection";

export type ConversationWithLabels = ConversationListItem & {
  labelIds: string[];
};

type Props = {
  initial: ConversationWithLabels[];
  labels: LabelChip[];
  /** Active sector cookie — scopes Realtime/safety refresh (admin multi-membership). */
  activeSectorId: string;
  activeId?: string;
  channelConnected?: boolean;
  /** Kapso: B→A unread reconcile on focus. Baileys ignores. */
  channelProvider?: ChannelProvider;
};

const chipBase =
  "inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-semibold leading-none touch-manipulation transition-colors active:opacity-90";
const btnIdle =
  "border-[color-mix(in_srgb,var(--color-gris)_22%,transparent)] bg-[var(--bg-surface)] text-[var(--text-primary)]";
const btnTeal =
  "border-[var(--color-teal)] bg-[color-mix(in_srgb,var(--color-teal)_12%,white)] text-[var(--color-teal)]";
const btnNaranja =
  "border-[var(--color-naranja)] bg-[color-mix(in_srgb,var(--color-naranja)_14%,white)] text-[var(--color-naranja)]";

function fold(s: string): string {
  return s
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function isUnreadLabel(name: string): boolean {
  return isWaUnreadLabelName(name);
}

/** Native WA Favoritos / Favorites / Starred — never invent a CRM-only label. */
function isFavoritesLabel(name: string): boolean {
  const n = fold(name).toUpperCase();
  // Exact aliases only: substring match would steal CRM lists (e.g. "Clientes favoritos")
  // from the Listas menu and bind the chip to the wrong label.
  return (
    n === "FAVORITOS" ||
    n === "FAVORITES" ||
    n === "FAVORITE" ||
    n === "STARRED" ||
    n === "STAR" ||
    n === "DESTACADOS" ||
    n === "DESTACADO"
  );
}

function InboundSoundIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {enabled ? (
        <>
          <path d="M11 5L6 9H3v6h3l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      ) : (
        <>
          <path d="M11 5L6 9H3v6h3l5 4V5z" />
          <path d="M22 9l-6 6" />
          <path d="M16 9l6 6" />
        </>
      )}
    </svg>
  );
}

function mapContactName(contact: {
  display_name?: string | null;
  agenda_name?: string | null;
  verified_name?: string | null;
  push_name?: string | null;
  phone_e164?: string | null;
} | null): string {
  if (!contact) return "Sin nombre";
  return computeDisplayName({
    agenda_name: contact.agenda_name,
    verified_name: contact.verified_name,
    push_name: contact.push_name ?? contact.display_name,
    phone_e164: contact.phone_e164,
  });
}

type ConversationQueryRow = {
  id: string;
  sector_id?: string | null;
  kind?: string | null;
  title?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  contacts?: unknown;
  messages?: unknown;
};

function rowFromConversationQuery(
  c: ConversationQueryRow,
  labelIds: string[],
  unreadByConv: Map<string, number>,
  unreadLabelId: string | null,
  avatarUrl: string | null,
): ConversationWithLabels {
  const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
  const meta = lastMessageMetaFromEmbed(c.messages);
  const hasWaUnread =
    unreadLabelId != null && labelIds.includes(unreadLabelId);
  return {
    id: c.id,
    last_message_at: c.last_message_at ?? null,
    last_message_preview: c.last_message_preview ?? null,
    contact_name: mapContactName(
      contact as {
        display_name?: string;
        agenda_name?: string;
        verified_name?: string;
        push_name?: string;
        phone_e164?: string | null;
      } | null,
    ),
    phone_e164:
      (contact as { phone_e164?: string | null } | null)?.phone_e164 ?? null,
    avatar_url: avatarUrl,
    last_direction: meta.direction,
    last_delivery_status: meta.delivery_status,
    kind: (c.kind === "group" ? "group" : "direct") as "direct" | "group",
    title: c.title ?? null,
    unread_count: badgeCountForChat({
      hasWaUnreadLabel: hasWaUnread,
      cursorUnreadCount: unreadByConv.get(c.id) ?? 0,
    }),
    labelIds,
  };
}

function sortByLastMessage(a: ConversationWithLabels, b: ConversationWithLabels) {
  const ta = a.last_message_at ?? "";
  const tb = b.last_message_at ?? "";
  if (ta === tb) return 0;
  return ta < tb ? 1 : -1;
}

function ListasIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

export function InboxWithLabelFilter({
  initial,
  labels,
  activeSectorId,
  activeId,
  channelConnected = false,
  channelProvider = "baileys",
}: Props) {
  const [listasOpen, setListasOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [groupsOnly, setGroupsOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [soundPref, setSoundPref] = useState<InboundSoundPref>(() =>
    readInboundSoundPref(activeSectorId),
  );
  const [soundSectorId, setSoundSectorId] = useState(activeSectorId);
  if (soundSectorId !== activeSectorId) {
    setSoundSectorId(activeSectorId);
    setSoundPref(readInboundSoundPref(activeSectorId));
  }
  const labelsRef = useRef(labels);
  const activeIdRef = useRef(activeId);
  const soundEnabledRef = useRef(soundPref === "on");
  const listasTitleId = useId();
  /** Session cache: conversation id → signed avatar URL (never re-sign on patch). */
  const avatarUrlByIdRef = useRef(
    new Map(initial.map((r) => [r.id, r.avatar_url ?? null])),
  );

  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    ensureInboundSoundUnlockWired();
  }, [activeSectorId]);

  useEffect(() => {
    soundEnabledRef.current = soundPref === "on";
  }, [soundPref]);

  useEffect(() => {
    for (const r of initial) {
      if (r.avatar_url) avatarUrlByIdRef.current.set(r.id, r.avatar_url);
    }
  }, [initial]);

  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setRows(initial);
  }

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    const patchTimers = new Map<string, ReturnType<typeof setTimeout>>();

    function unreadLabelId(): string | null {
      return labelsRef.current.find((l) => isUnreadLabel(l.name))?.id ?? null;
    }

    function rememberAvatars(prev: ConversationWithLabels[]) {
      for (const r of prev) {
        if (r.avatar_url) avatarUrlByIdRef.current.set(r.id, r.avatar_url);
      }
    }

    async function fetchUnreadMap() {
      const { data: unreadRows } = await supabase.rpc("crm_inbox_unread_counts", {
        p_sector_id: activeSectorId,
      });
      return unreadCountMapFromRpc(
        unreadRows as
          | { conversation_id?: string; unread_count?: number }[]
          | null,
      );
    }

    /** null = query error — callers must keep prior labelIds (no empty flash). */
    async function fetchLabelIds(
      conversationId: string,
    ): Promise<string[] | null> {
      const { data, error } = await supabase
        .from("conversation_labels")
        .select("label_id")
        .eq("conversation_id", conversationId);
      if (error || data == null) return null;
      return data.map((l) => l.label_id as string);
    }

    async function fetchOneConversation(id: string) {
      const { data } = await supabase
        .from("conversations")
        .select(CONVERSATION_LIST_SELECT)
        .eq("id", id)
        .eq("sector_id", activeSectorId)
        .order("created_at", {
          ascending: false,
          referencedTable: "messages",
        })
        .limit(1, { referencedTable: "messages" })
        .maybeSingle();
      return data as ConversationQueryRow | null;
    }

    /** Full list — safety path only (focus / rare). */
    async function refreshFull() {
      const [{ data: conversations }, { data: links }, unreadByConv] =
        await Promise.all([
          supabase
            .from("conversations")
            .select(CONVERSATION_LIST_SELECT)
            .eq("sector_id", activeSectorId)
            .order("last_message_at", {
              ascending: false,
              nullsFirst: false,
            })
            .order("created_at", {
              ascending: false,
              referencedTable: "messages",
            })
            .limit(1, { referencedTable: "messages" })
            .limit(80),
          supabase.from("conversation_labels").select("conversation_id, label_id"),
          fetchUnreadMap(),
        ]);
      if (cancelled || !conversations) return;

      const byConv = new Map<string, string[]>();
      if (links) {
        for (const link of links) {
          const cid = link.conversation_id as string;
          const lid = link.label_id as string;
          const arr = byConv.get(cid) ?? [];
          arr.push(lid);
          byConv.set(cid, arr);
        }
      }

      setRows((prev) => {
        rememberAvatars(prev);
        const prevLabels = new Map(prev.map((r) => [r.id, r.labelIds]));
        const ulid = unreadLabelId();
        return conversations.map((c) => {
          const id = c.id as string;
          const labelIds = links
            ? (byConv.get(id) ?? [])
            : (prevLabels.get(id) ?? []);
          return rowFromConversationQuery(
            c as ConversationQueryRow,
            labelIds,
            unreadByConv,
            ulid,
            avatarUrlByIdRef.current.get(id) ?? null,
          );
        });
      });
    }

    async function patchConversation(conversationId: string) {
      const [c, labelIds, unreadByConv] = await Promise.all([
        fetchOneConversation(conversationId),
        fetchLabelIds(conversationId),
        fetchUnreadMap(),
      ]);
      if (cancelled || !c) return;

      setRows((prev) => {
        rememberAvatars(prev);
        const prior = prev.find((r) => r.id === conversationId);
        // null labels = query error — keep prior (same as refreshFull).
        const resolvedLabels = labelIds ?? prior?.labelIds ?? [];
        const next = rowFromConversationQuery(
          c,
          resolvedLabels,
          unreadByConv,
          unreadLabelId(),
          avatarUrlByIdRef.current.get(conversationId) ?? null,
        );
        const without = prev.filter((r) => r.id !== conversationId);
        return [...without, next].sort(sortByLastMessage).slice(0, 80);
      });
    }

    /** Message UPDATE (ticks): one-row fetch; keep labelIds + unread_count (no global RPC). */
    async function patchConversationMeta(conversationId: string) {
      const c = await fetchOneConversation(conversationId);
      if (cancelled || !c) return;
      setRows((prev) => {
        rememberAvatars(prev);
        const prior = prev.find((r) => r.id === conversationId);
        const labelIds = prior?.labelIds ?? [];
        const unreadByConv = new Map<string, number>();
        if (prior) {
          // Preserve badge magnitude; hasWaUnread recomputed from labels.
          unreadByConv.set(
            conversationId,
            Math.max(0, prior.unread_count ?? 0),
          );
        }
        const next = rowFromConversationQuery(
          c,
          labelIds,
          unreadByConv,
          unreadLabelId(),
          avatarUrlByIdRef.current.get(conversationId) ??
            prior?.avatar_url ??
            null,
        );
        // Keep prior unread_count exactly (badgeCountForChat may bump to min 1).
        if (prior) next.unread_count = prior.unread_count;
        const without = prev.filter((r) => r.id !== conversationId);
        return [...without, next].sort(sortByLastMessage).slice(0, 80);
      });
    }

    async function patchLabelsOnly(conversationId: string) {
      const [labelIds, unreadByConv] = await Promise.all([
        fetchLabelIds(conversationId),
        fetchUnreadMap(),
      ]);
      if (cancelled || labelIds == null) return;
      const ulid = unreadLabelId();
      setRows((prev) => {
        rememberAvatars(prev);
        let found = false;
        const mapped = prev.map((r) => {
          if (r.id !== conversationId) return r;
          found = true;
          const hasWaUnread = ulid != null && labelIds.includes(ulid);
          return {
            ...r,
            labelIds,
            unread_count: badgeCountForChat({
              hasWaUnreadLabel: hasWaUnread,
              cursorUnreadCount: unreadByConv.get(r.id) ?? 0,
            }),
          };
        });
        return found ? mapped : prev;
      });
    }

    function schedulePatch(
      conversationId: string,
      mode: "full" | "labels" | "meta",
    ) {
      const fullKey = `full:${conversationId}`;
      const labelsKey = `labels:${conversationId}`;
      const metaKey = `meta:${conversationId}`;
      if (mode === "full") {
        for (const k of [labelsKey, metaKey]) {
          const pending = patchTimers.get(k);
          if (pending) {
            clearTimeout(pending);
            patchTimers.delete(k);
          }
        }
      } else if (patchTimers.has(fullKey)) {
        return;
      } else if (mode === "labels" && patchTimers.has(metaKey)) {
        // labels need unread RPC; cancel stale meta.
        const pending = patchTimers.get(metaKey);
        if (pending) {
          clearTimeout(pending);
          patchTimers.delete(metaKey);
        }
      }
      const key =
        mode === "full" ? fullKey : mode === "labels" ? labelsKey : metaKey;
      const existing = patchTimers.get(key);
      if (existing) clearTimeout(existing);
      patchTimers.set(
        key,
        setTimeout(() => {
          patchTimers.delete(key);
          if (mode === "labels") void patchLabelsOnly(conversationId);
          else if (mode === "meta") void patchConversationMeta(conversationId);
          else void patchConversation(conversationId);
        }, 120),
      );
    }

    function scheduleSafetyRefresh() {
      if (safetyTimer) clearTimeout(safetyTimer);
      safetyTimer = setTimeout(() => {
        safetyTimer = null;
        void (async () => {
          // B→A Kapso: native inbox read → clear CRM unread before list refresh.
          if (channelProvider === "kapso") {
            try {
              await reconcileKapsoUnreadFromPlatform();
            } catch (err) {
              console.error("kapso_unread_reconcile_failed", err);
            }
          }
          await refreshFull();
        })();
      }, 250);
    }

    async function subscribe() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.access_token) return;
      await supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel("s18b-inbox-list")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversations" },
          (payload) => {
            const rowNew = payload.new as {
              id?: string;
              sector_id?: string;
            } | null;
            const rowOld = payload.old as {
              id?: string;
              sector_id?: string;
            } | null;
            const sectorOf = rowNew?.sector_id ?? rowOld?.sector_id ?? null;
            if (sectorOf && sectorOf !== activeSectorId) return;
            const id = rowNew?.id ?? rowOld?.id;
            if (!id) {
              scheduleSafetyRefresh();
              return;
            }
            if (payload.eventType === "DELETE") {
              setRows((prev) => prev.filter((r) => r.id !== id));
              return;
            }
            schedulePatch(id, "full");
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversation_labels" },
          (payload) => {
            const id =
              (payload.new as { conversation_id?: string } | null)
                ?.conversation_id ??
              (payload.old as { conversation_id?: string } | null)
                ?.conversation_id;
            if (!id) {
              scheduleSafetyRefresh();
              return;
            }
            schedulePatch(id, "labels");
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as {
              conversation_id?: string;
              sector_id?: string;
              direction?: string;
            } | null;
            if (row?.sector_id && row.sector_id !== activeSectorId) return;
            const id = row?.conversation_id;
            if (!id) return;
            if (
              shouldPlayInboundSound({
                enabled: soundEnabledRef.current,
                direction: row?.direction,
                conversationId: id,
                activeConversationId: activeIdRef.current,
                messageSectorId: row?.sector_id,
                activeSectorId,
              })
            ) {
              playInboundSound();
            }
            schedulePatch(id, "full");
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as {
              conversation_id?: string;
              sector_id?: string;
            } | null;
            if (row?.sector_id && row.sector_id !== activeSectorId) return;
            const id = row?.conversation_id;
            if (!id) return;
            schedulePatch(id, "meta");
          },
        )
        .subscribe();
    }

    void subscribe();

    function onVisibility() {
      if (document.visibilityState === "visible") scheduleSafetyRefresh();
    }
    document.addEventListener("visibilitychange", onVisibility);

    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "TOKEN_REFRESHED" && event !== "SIGNED_IN") return;
      if (!session?.access_token) return;
      void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      authSub.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      if (safetyTimer) clearTimeout(safetyTimer);
      for (const t of patchTimers.values()) clearTimeout(t);
      patchTimers.clear();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [activeSectorId, channelProvider]);

  const unreadLabel = useMemo(
    () => labels.find((l) => isUnreadLabel(l.name)) ?? null,
    [labels],
  );

  const labelsById = useMemo(() => {
    const map = new Map<string, LabelChip>();
    for (const l of labels) map.set(l.id, l);
    return map;
  }, [labels]);

  const unreadCount = useMemo(() => {
    if (!unreadLabel) return 0;
    return rows.filter((c) => c.labelIds.includes(unreadLabel.id)).length;
  }, [rows, unreadLabel]);

  const listLabels = useMemo(() => {
    const withoutQuick = labels.filter(
      (l) => !isUnreadLabel(l.name) && !isFavoritesLabel(l.name),
    );
    const cobranzas = withoutQuick.find((l) =>
      l.name.trim().toUpperCase().includes("COBRANZAS"),
    );
    if (!cobranzas) return withoutQuick;
    return [cobranzas, ...withoutQuick.filter((l) => l.id !== cobranzas.id)];
  }, [labels]);

  const filtered = useMemo(() => {
    let list = dedupeDirectConversationsByPhone(rows);

    if (groupsOnly) {
      list = list.filter((c) => c.kind === "group");
    }

    if (unreadOnly && unreadLabel) {
      list = list.filter((c) => c.labelIds.includes(unreadLabel.id));
    }

    if (selectedIds.length > 0) {
      const wanted = new Set(selectedIds);
      list = list.filter((c) => c.labelIds.some((id) => wanted.has(id)));
    }

    const q = fold(query);
    if (q) {
      const digits = q.replace(/\D/g, "");
      list = list.filter((c) => {
        const name = fold(
          c.kind === "group" ? (c.title ?? "Grupo") : c.contact_name,
        );
        const preview = fold(c.last_message_preview ?? "");
        const phone = (c.phone_e164 ?? "").toLowerCase();
        if (name.includes(q) || preview.includes(q)) return true;
        if (digits.length >= 3 && phone.replace(/\D/g, "").includes(digits)) {
          return true;
        }
        return phone.includes(q);
      });
    }

    return list;
  }, [
    rows,
    selectedIds,
    unreadOnly,
    unreadLabel,
    query,
    groupsOnly,
  ]);

  const filterActive =
    unreadOnly ||
    groupsOnly ||
    selectedIds.length > 0 ||
    fold(query).length > 0;

  useEffect(() => {
    if (!listasOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setListasOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [listasOpen]);

  function toggleLabel(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSound() {
    const next: InboundSoundPref = soundPref === "on" ? "off" : "on";
    setSoundPref(next);
    writeInboundSoundPref(activeSectorId, next);
    if (next === "on") unlockInboundSound();
  }

  const activeCount = selectedIds.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex shrink-0 items-center gap-1.5">
        <label className="sr-only" htmlFor="inbox-search">
          Buscar conversaciones
        </label>
        <input
          id="inbox-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nombre, teléfono o mensaje"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-lg border border-[color-mix(in_srgb,var(--color-gris)_22%,transparent)] bg-[var(--bg-surface)] px-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--color-teal)] focus:outline-2 focus:outline-[var(--color-teal)]"
        />
        <button
          type="button"
          aria-pressed={soundPref === "on"}
          aria-label={
            soundPref === "on"
              ? "Silenciar notificaciones sonoras"
              : "Activar notificaciones sonoras"
          }
          title={
            soundPref === "on"
              ? "Sonido de mensajes: activado"
              : "Sonido de mensajes: silenciado"
          }
          onClick={toggleSound}
          className="btn-institucional inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center p-0"
        >
          <InboundSoundIcon enabled={soundPref === "on"} />
        </button>
        <NewChatButton channelConnected={channelConnected} />
      </div>

      <div className="flex shrink-0 flex-nowrap items-center gap-1">
        {unreadLabel ? (
          <button
            type="button"
            aria-pressed={unreadOnly}
            className={`${chipBase} shrink ${unreadOnly ? btnNaranja : btnIdle}`}
            onClick={() => setUnreadOnly((v) => !v)}
          >
            <span className="truncate">No leídos</span>
            {unreadCount > 0 ? (
              <span
                className={`shrink-0 rounded-full px-1 text-[9px] font-bold leading-none ${
                  unreadOnly
                    ? "bg-[var(--color-naranja)] text-white"
                    : "bg-[color-mix(in_srgb,var(--color-naranja)_18%,white)] text-[var(--color-naranja)]"
                }`}
              >
                {unreadCount}
              </span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          aria-pressed={groupsOnly}
          className={`${chipBase} shrink-0 ${groupsOnly ? btnTeal : btnIdle}`}
          onClick={() => setGroupsOnly((v) => !v)}
        >
          Grupos
        </button>

        <button
          type="button"
          className={`${chipBase} shrink-0 ${activeCount > 0 ? btnTeal : btnIdle}`}
          aria-haspopup="dialog"
          aria-expanded={listasOpen}
          aria-controls="inbox-label-filter-menu"
          onClick={() => setListasOpen(true)}
        >
          <ListasIcon />
          <span>Listas</span>
          {activeCount > 0 ? (
            <span className="shrink-0 rounded-full bg-[var(--color-teal)] px-1 text-[9px] font-bold leading-none text-white">
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      {listasOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-gris)_45%,transparent)] p-4"
          role="presentation"
          onClick={() => setListasOpen(false)}
        >
          <div
            id="inbox-label-filter-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby={listasTitleId}
            className="flex max-h-[min(80dvh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-gris)_14%,transparent)] bg-[var(--bg-surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[color-mix(in_srgb,var(--color-gris)_10%,transparent)] px-4 py-3">
              <div className="min-w-0">
                <h2
                  id={listasTitleId}
                  className="font-heading text-lg font-bold text-[var(--text-primary)]"
                >
                  Filtrar por listas
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Elegí qué etiquetas querés ver en la bandeja.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--color-naranja)]"
                aria-label="Cerrar"
                onClick={() => setListasOpen(false)}
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

            {listLabels.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">
                Todavía no hay listas sincronizadas.
              </p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2 [scrollbar-width:thin]">
                {listLabels.map((label) => {
                  const checked = selectedIds.includes(label.id);
                  return (
                    <li key={label.id}>
                      <label
                        className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--color-teal)_8%,transparent)] ${
                          checked
                            ? "bg-[color-mix(in_srgb,var(--color-teal)_10%,transparent)]"
                            : ""
                        }`}
                      >
                        <span className="min-w-0 truncate text-sm font-medium">
                          {label.name}
                        </span>
                        <span className="relative inline-flex shrink-0">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={checked}
                            onChange={() => toggleLabel(label.id)}
                          />
                          <span
                            aria-hidden
                            className={`block h-6 w-11 rounded-full transition-colors ${
                              checked
                                ? "bg-[var(--color-teal)]"
                                : "bg-[color-mix(in_srgb,var(--color-gris)_28%,transparent)]"
                            }`}
                          />
                          <span
                            aria-hidden
                            className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              checked ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex gap-2 border-t border-[color-mix(in_srgb,var(--color-gris)_10%,transparent)] px-4 py-3">
              {activeCount > 0 ? (
                <button
                  type="button"
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--color-gris)_22%,transparent)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--color-teal)] hover:text-[var(--color-teal)]"
                  onClick={() => setSelectedIds([])}
                >
                  Limpiar
                </button>
              ) : null}
              <button
                type="button"
                className="btn-institucional min-h-11 flex-1 px-3 py-2 text-sm"
                onClick={() => setListasOpen(false)}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConversationList
        rows={filtered.map((c) => ({
          id: c.id,
          last_message_at: c.last_message_at,
          last_message_preview: c.last_message_preview,
          contact_name: c.contact_name,
          phone_e164: c.phone_e164,
          avatar_url: c.avatar_url,
          last_direction: c.last_direction,
          last_delivery_status: c.last_delivery_status,
          kind: c.kind,
          title: c.title,
          unread_count: c.unread_count,
          labels: c.labelIds
            .map((id) => labelsById.get(id))
            .filter((l): l is LabelChip => l != null)
            .filter((l) => !isUnreadLabel(l.name))
            .map((l) => ({ id: l.id, name: l.name, color: l.color })),
        }))}
        activeId={activeId}
        emptyTitle={
          filterActive ? "Sin resultados" : "Sin conversaciones todavía"
        }
        emptyBody={
          filterActive
            ? "Probá otro término o limpiá los filtros."
            : "Cuando un vecino escriba al número institucional, el chat aparece acá."
        }
      />
      <ConversationContextMenuLayer />
    </div>
  );
}
