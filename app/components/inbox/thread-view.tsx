"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { markConversationRead } from "@/app/actions/team-read-actions";
import { DeliveryTicks } from "@/app/components/inbox/delivery-ticks";
import { MessageAudio } from "@/app/components/inbox/message-audio";
import { MessageDocument } from "@/app/components/inbox/message-document";
import { MessageImage } from "@/app/components/inbox/message-image";
import { openMessageContextMenu } from "@/app/components/inbox/message-context-menu";
import {
  bodyLabel,
  DELETED_MESSAGE_LABEL,
  formatTime,
  isMessageDeleted,
  mergeThreadRows,
  type ThreadMessage,
} from "@/app/components/inbox/thread-view-utils";
import {
  CRM_HOLD_UNREAD_EVENT,
  clearTeamUnreadHold,
  formatProfileDisplayName,
  isInboundTeamUnread,
  isTeamUnreadHeld,
  teamReadAttribution,
  type TeamReadVia,
} from "@/lib/inbox/team-read";
import { createLongPressHandlers } from "@/lib/inbox/long-press";
import { outboundOriginAuthorLabel } from "@/lib/kapso/outbound-origin";
import { createClient } from "@/lib/supabase/client";
import type {
  DeliveryStatus,
  MessageDirection,
  MessageType,
  OutboundOrigin,
} from "@/lib/supabase/types";

export type { ThreadMessage } from "@/app/components/inbox/thread-view-utils";

type Props = {
  conversationId: string;
  initial: ThreadMessage[];
  initiallyUnread?: boolean;
  initialTeamReadAt?: string | null;
  initialTeamReadByName?: string | null;
  initialTeamReadVia?: TeamReadVia | null;
  /** Client-only rows (e.g. enqueue failures) merged into the thread. */
  localMessages?: ThreadMessage[];
  onRetryFailed?: (message: ThreadMessage) => Promise<boolean>;
  onRetrySettled?: () => void;
  /** Fired when a new inbound lands (Kapso 24h window reopen). */
  onInboundMessage?: () => void;
};

function messageBody(m: ThreadMessage) {
  if (isMessageDeleted(m)) {
    return (
      <p className="text-[13px] italic text-[var(--text-muted)]">
        {DELETED_MESSAGE_LABEL}
      </p>
    );
  }
  if (m.media_bucket_path) {
    if (m.type === "audio") {
      return <MessageAudio path={m.media_bucket_path} />;
    }
    if (m.type === "image") {
      return (
        <MessageImage path={m.media_bucket_path} caption={m.body} />
      );
    }
    if (m.type === "document") {
      return (
        <MessageDocument path={m.media_bucket_path} label={m.body} />
      );
    }
  }
  return (
    <p className="whitespace-pre-wrap break-words">{bodyLabel(m)}</p>
  );
}

function openMenuForMessage(
  e: KeyboardEvent,
  message: ThreadMessage,
) {
  if (isMessageDeleted(message)) return;
  e.preventDefault();
  const rect =
    e.currentTarget instanceof HTMLElement
      ? e.currentTarget.getBoundingClientRect()
      : null;
  const x = (rect?.left ?? 0) + 24;
  const y = (rect?.top ?? 0) + 24;
  openMessageContextMenu({ x, y, message });
}

function MessageBubble({
  m,
  out,
  deleted,
  teamUnread,
  quoteText,
  attribution,
  teamReadAt,
  teamReadVia,
  onRetry,
  retrying,
}: {
  m: ThreadMessage;
  out: boolean;
  deleted: boolean;
  teamUnread: boolean;
  quoteText: string | null;
  attribution: string | null;
  teamReadAt: string | null;
  teamReadVia: TeamReadVia | null;
  onRetry?: (message: ThreadMessage) => void;
  retrying?: boolean;
}) {
  const longPress = useMemo(
    () =>
      createLongPressHandlers({
        enabled: !deleted,
        onOpen: (x, y) => openMessageContextMenu({ x, y, message: m }),
      }),
    [deleted, m],
  );

  return (
    <li className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        tabIndex={deleted ? undefined : 0}
        role="group"
        aria-label={deleted ? "Mensaje eliminado" : "Mensaje"}
        className={`max-w-[85%] min-w-0 touch-manipulation overflow-hidden rounded-2xl px-3 py-2 text-sm outline-none ${
          deleted
            ? "bg-[color-mix(in_srgb,var(--color-gris)_6%,white)]"
            : out
              ? "bg-[color-mix(in_srgb,var(--color-teal)_18%,white)] focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] active:brightness-95"
              : teamUnread
                ? "bg-[color-mix(in_srgb,var(--color-naranja)_10%,white)] font-semibold focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] active:brightness-95"
                : "bg-[color-mix(in_srgb,var(--color-gris)_8%,white)] focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] active:brightness-95"
        }`}
        {...(deleted ? {} : longPress)}
        onKeyDown={
          deleted
            ? undefined
            : (e) => {
                if (
                  e.key === "ContextMenu" ||
                  (e.shiftKey && e.key === "F10")
                ) {
                  openMenuForMessage(e, m);
                }
              }
        }
      >
        {m.author_label && !deleted ? (
          <p
            className={`mb-0.5 text-[11px] font-semibold ${
              out
                ? "text-[var(--color-teal)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            {m.author_label}
          </p>
        ) : out && !deleted ? (
          <p className="mb-0.5 text-[11px] font-semibold text-[var(--color-teal)]">
            Teléfono
          </p>
        ) : null}
        {quoteText ? (
          <blockquote className="mb-1 border-l-2 border-[var(--color-naranja)] pl-2 text-[12px] text-[var(--text-secondary)]">
            {quoteText}
          </blockquote>
        ) : null}
        {messageBody(m)}
        <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-[var(--text-muted)]">
          <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
          {out && !deleted ? (
            <DeliveryTicks status={m.delivery_status} />
          ) : null}
        </div>
        {out && !deleted && m.delivery_status === "failed" && onRetry ? (
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              className="text-[11px] font-medium text-[var(--danger)] underline-offset-2 touch-manipulation hover:underline disabled:opacity-60"
              disabled={retrying}
              onMouseDown={(e) => {
                // Avoid lasting focus steal from the Composer after click.
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onRetry(m);
              }}
            >
              {retrying ? "Reintentando…" : "Volver a intentar"}
            </button>
          </div>
        ) : null}
        {attribution ? (
          <p className="mt-0.5 text-right text-[10px] font-normal text-[var(--text-muted)]">
            {attribution}
            {teamReadAt && teamReadVia === "crm"
              ? ` · ${formatTime(teamReadAt)}`
              : ""}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function ThreadView({
  conversationId,
  initial,
  initiallyUnread = false,
  initialTeamReadAt = null,
  initialTeamReadByName = null,
  initialTeamReadVia = null,
  localMessages = [],
  onRetryFailed,
  onRetrySettled,
  onInboundMessage,
}: Props) {
  const [rows, setRows] = useState(initial);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(() => new Set());
  const retryingRef = useRef<Set<string>>(new Set());
  const [teamReadAt, setTeamReadAt] = useState(initialTeamReadAt);
  const [teamReadByName, setTeamReadByName] = useState(initialTeamReadByName);
  const [teamReadVia, setTeamReadVia] = useState(initialTeamReadVia);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLUListElement>(null);
  const [source, setSource] = useState({conversationId, initial, initialTeamReadAt, initialTeamReadByName, initialTeamReadVia});
  const [readOnOpen, setReadOnOpen] = useState({conversationId, initiallyUnread});
  if (readOnOpen.conversationId !== conversationId) setReadOnOpen({conversationId, initiallyUnread});
  const holdUnreadRef = useRef(false);
  const markingRef = useRef(false);
  const onInboundRef = useRef(onInboundMessage);
  useLayoutEffect(() => { onInboundRef.current = onInboundMessage; }, [onInboundMessage]);

  if (source.conversationId !== conversationId || source.initial !== initial || source.initialTeamReadAt !== initialTeamReadAt || source.initialTeamReadByName !== initialTeamReadByName || source.initialTeamReadVia !== initialTeamReadVia) {
    setSource({conversationId, initial, initialTeamReadAt, initialTeamReadByName, initialTeamReadVia});
    setRows(source.conversationId !== conversationId ? initial : mergeThreadRows(initial, rows));
    setTeamReadAt(initialTeamReadAt);
    setTeamReadByName(initialTeamReadByName);
    setTeamReadVia(initialTeamReadVia);
  }

  const displayRows = useMemo(
    () => mergeThreadRows(rows, localMessages),
    [rows, localMessages],
  );

  const handleRetry = useCallback(
    (message: ThreadMessage) => {
      if (!onRetryFailed || retryingRef.current.has(message.id)) return;

      const isLocal = message.id.startsWith("local:");
      retryingRef.current.add(message.id);
      setRetryingIds(new Set(retryingRef.current));
      if (!isLocal) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === message.id
              ? { ...r, delivery_status: "pending" }
              : r,
          ),
        );
      }

      void (async () => {
        try {
          const ok = await onRetryFailed(message);
          if (!ok && !isLocal) {
            setRows((prev) =>
              prev.map((r) =>
                r.id === message.id
                  ? { ...r, delivery_status: "failed" }
                  : r,
              ),
            );
          }
        } finally {
          retryingRef.current.delete(message.id);
          setRetryingIds(new Set(retryingRef.current));
          onRetrySettled?.();
        }
      })();
    },
    [onRetryFailed, onRetrySettled],
  );

  // Stick to the latest messages on open. Media (images) expands after first paint
  // and would leave the viewport ~N00px above the true bottom without re-pinning.
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    let pinned = true;
    let programmatic = false;
    let raf = 0;
    const openedAt = performance.now();
    const FORCE_MS = 2500;

    const scrollToEnd = () => {
      const force = performance.now() - openedAt < FORCE_MS;
      if (!pinned && !force) return;
      programmatic = true;
      root.scrollTop = root.scrollHeight;
      requestAnimationFrame(() => {
        programmatic = false;
      });
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        scrollToEnd();
        raf = requestAnimationFrame(scrollToEnd);
      });
    };

    schedule();

    const onScroll = () => {
      if (programmatic) return;
      // During the open window, keep sticking even if layout thrash fires scroll.
      if (performance.now() - openedAt < FORCE_MS) {
        pinned = true;
        schedule();
        return;
      }
      const distance =
        root.scrollHeight - root.clientHeight - root.scrollTop;
      pinned = distance <= 120;
    };

    const onLoadCapture = (event: Event) => {
      if (event.target instanceof HTMLImageElement) schedule();
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("load", onLoadCapture, true);

    const resizeObserver = new ResizeObserver(schedule);
    for (const child of root.children) {
      resizeObserver.observe(child);
    }

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) resizeObserver.observe(node);
        }
      }
      schedule();
    });
    mutationObserver.observe(root, { childList: true, subtree: true });

    const forceInterval = window.setInterval(schedule, 150);
    const forceStop = window.setTimeout(() => {
      window.clearInterval(forceInterval);
      schedule();
    }, FORCE_MS);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(forceInterval);
      window.clearTimeout(forceStop);
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("load", onLoadCapture, true);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [conversationId, displayRows.length]);

  useEffect(() => {
    holdUnreadRef.current = isTeamUnreadHeld(conversationId);
    function onHold(e: Event) {
      const detail = (e as CustomEvent<{ conversationId?: string }>).detail;
      if (detail?.conversationId !== conversationId) return;
      holdUnreadRef.current = true;
    }
    window.addEventListener(CRM_HOLD_UNREAD_EVENT, onHold);
    return () => window.removeEventListener(CRM_HOLD_UNREAD_EVENT, onHold);
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;

    async function advanceRead() {
      // Only on conversation open. Do not re-run when initiallyUnread flips
      // after «Marcar no leído» (that would undo the WA write).
      if (
        !readOnOpen.initiallyUnread ||
        holdUnreadRef.current ||
        isTeamUnreadHeld(conversationId) ||
        markingRef.current
      ) {
        return;
      }
      markingRef.current = true;
      try {
        const result = await markConversationRead(conversationId);
        if (cancelled || !result.ok) return;
        clearTeamUnreadHold(conversationId);
      } finally {
        markingRef.current = false;
      }
    }

    // Defer so holdTeamUnread() from the same click lands first.
    // readOnOpen captures this conversation open only (not when it
    // flips after mark-unread on the same mount).
    const timer = window.setTimeout(() => {
      void advanceRead();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [conversationId, readOnOpen.initiallyUnread]);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const upsert = (payload: {
      new: Record<string, unknown>;
      eventType?: string;
    }) => {
      const next = payload.new as {
        id?: string;
        conversation_id?: string;
        wa_message_id?: string | null;
        direction?: MessageDirection;
        type?: MessageType;
        body?: string | null;
        media_bucket_path?: string | null;
        delivery_status?: DeliveryStatus;
        created_at?: string;
        sent_by?: string | null;
        outbound_origin?: OutboundOrigin | null;
        wa_sender_name?: string | null;
        wa_sender_jid?: string | null;
        quoted_message_id?: string | null;
        quoted_wa_message_id?: string | null;
        quoted_body_preview?: string | null;
        deleted_at?: string | null;
      };
      if (!next?.id || next.conversation_id !== conversationId) return;

      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === next.id);
        const inboundLabel =
          next.wa_sender_name?.trim() ||
          next.wa_sender_jid?.split("@")[0] ||
          null;
        const base: ThreadMessage = {
          id: next.id!,
          wa_message_id: next.wa_message_id ?? null,
          direction: next.direction ?? "in",
          type: next.type ?? "text",
          body: next.body ?? null,
          media_bucket_path: next.media_bucket_path ?? null,
          delivery_status: next.delivery_status ?? "pending",
          created_at: next.created_at ?? new Date().toISOString(),
          author_label:
            idx >= 0
              ? prev[idx].author_label
              : next.direction === "out"
                ? next.sent_by
                  ? null
                  : outboundOriginAuthorLabel(next.outbound_origin)
                : inboundLabel,
          quoted_message_id: next.quoted_message_id ?? null,
          quoted_wa_message_id: next.quoted_wa_message_id ?? null,
          quoted_body_preview: next.quoted_body_preview ?? null,
          deleted_at: next.deleted_at ?? null,
        };
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = {
            ...copy[idx],
            ...base,
            author_label: copy[idx].author_label,
          };
          return copy;
        }
        return [...prev, base];
      });

      if (
        payload.eventType === "INSERT" &&
        next.direction === "in"
      ) {
        onInboundRef.current?.();
        if (!holdUnreadRef.current && !isTeamUnreadHeld(conversationId)) {
          void markConversationRead(conversationId);
        }
      }

      if (next.direction === "out" && next.sent_by) {
        void (async () => {
          const { data } = await supabase
            .from("profiles")
            .select("first_name, last_name, slug")
            .eq("id", next.sent_by!)
            .maybeSingle();
          if (!data) return;
          const label =
            [data.first_name, data.last_name].filter(Boolean).join(" ") ||
            data.slug;
          setRows((prev) =>
            prev.map((r) =>
              r.id === next.id ? { ...r, author_label: label } : r,
            ),
          );
        })();
      }
    };

    async function subscribe() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.access_token) return;
      await supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`s6-thread-${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => upsert({ ...payload, eventType: "INSERT" }),
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => upsert({ ...payload, eventType: "UPDATE" }),
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const old = payload.old as { id?: string };
            if (!old?.id) return;
            setRows((prev) => prev.filter((r) => r.id !== old.id));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "conversations",
            filter: `id=eq.${conversationId}`,
          },
          (payload) => {
            const next = payload.new as {
              team_read_at?: string | null;
              team_read_by?: string | null;
              team_read_via?: string | null;
            };
            if (next.team_read_at) setTeamReadAt(next.team_read_at);
            const via =
              next.team_read_via === "crm" || next.team_read_via === "whatsapp"
                ? next.team_read_via
                : null;
            setTeamReadVia(via);
            if (!next.team_read_by) {
              setTeamReadByName(null);
              return;
            }
            void (async () => {
              const { data } = await supabase
                .from("profiles")
                .select("first_name, last_name, slug")
                .eq("id", next.team_read_by!)
                .maybeSingle();
              if (cancelled) return;
              setTeamReadByName(formatProfileDisplayName(data));
            })();
          },
        )
        .subscribe();
    }

    void subscribe();

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
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return (
    <div className="card-institucional inbox-scroll-host relative min-h-0 min-w-0 flex-1">
      <ul
        ref={scrollRef}
        className="inbox-scroll absolute top-0 bottom-0 left-0 space-y-3 p-4"
      >
        {displayRows.length === 0 ? (
          <li className="text-sm text-[var(--text-secondary)]">
            Todavía no hay mensajes en este hilo.
          </li>
        ) : (
          displayRows.map((m) => {
            const out = m.direction === "out";
            const deleted = isMessageDeleted(m);
            const teamUnread =
              !out && !deleted && isInboundTeamUnread(m.created_at, teamReadAt);
            const attribution =
              !out &&
              !deleted &&
              !teamUnread &&
              Boolean(teamReadAt) &&
              !isInboundTeamUnread(m.created_at, teamReadAt)
                ? teamReadAttribution({
                    via: teamReadVia,
                    readerName: teamReadByName,
                  })
                : null;
            const quoteText =
              deleted
                ? null
                : m.quoted_body_preview ||
                  (m.quoted_message_id
                    ? displayRows.find((r) => r.id === m.quoted_message_id)
                      ? bodyLabel(
                          displayRows.find(
                            (r) => r.id === m.quoted_message_id,
                          )!,
                        )
                      : "Mensaje citado"
                    : null);
            return (
              <MessageBubble
                key={m.id}
                m={m}
                out={out}
                deleted={deleted}
                teamUnread={teamUnread}
                quoteText={quoteText}
                attribution={attribution}
                teamReadAt={teamReadAt}
                teamReadVia={teamReadVia}
                onRetry={onRetryFailed ? handleRetry : undefined}
                retrying={retryingIds.has(m.id)}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </ul>
    </div>
  );
}
