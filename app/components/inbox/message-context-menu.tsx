"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteMessageForEveryone,
  deleteMessageForMe,
} from "@/app/actions/message-actions";
import type { QuoteTarget } from "@/app/components/inbox/composer";
import {
  bodyLabel,
  isMessageDeleted,
  type ThreadMessage,
} from "@/app/components/inbox/thread-view-utils";

type MenuState = {
  x: number;
  y: number;
  message: ThreadMessage;
};

type Props = {
  conversationId: string;
  channelConnected: boolean;
  onReply?: (target: QuoteTarget) => void;
  onCopy?: (text: string) => void;
  onForward?: (messageId: string) => void;
  onDeleteQueued?: (messageId: string) => void;
};

type ItemDef = {
  id: string;
  label: string;
  disabled?: boolean;
  reason?: string;
  danger?: boolean;
  onSelect: () => void;
};

function clampMenuPosition(x: number, y: number, w: number, h: number) {
  const pad = 8;
  const maxX = window.innerWidth - w - pad;
  const maxY = window.innerHeight - h - pad;
  return {
    x: Math.max(pad, Math.min(x, maxX)),
    y: Math.max(pad, Math.min(y, maxY)),
  };
}

export function MessageContextMenuLayer({
  conversationId,
  channelConnected,
  onReply,
  onCopy,
  onForward,
  onDeleteQueued,
}: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMessageMenu(e: Event) {
      const detail = (e as CustomEvent<MenuState>).detail;
      if (!detail?.message) return;
      setDeleteOpen(false);
      setError(null);
      setMenu(detail);
    }
    window.addEventListener("thread-message-menu", onMessageMenu);
    return () =>
      window.removeEventListener("thread-message-menu", onMessageMenu);
  }, []);

  useEffect(() => {
    if (!menu) return;

    let remove: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      function onPointerDown(e: PointerEvent) {
        if (!menuRef.current?.contains(e.target as Node)) {
          setMenu(null);
          setDeleteOpen(false);
        }
      }
      function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") {
          setMenu(null);
          setDeleteOpen(false);
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
  }, [menu]);

  if (!menu) return null;

  const m = menu.message;
  const out = m.direction === "out";
  const deleted = isMessageDeleted(m);
  const hasWaId = Boolean(m.wa_message_id);
  const copyText = bodyLabel(m);
  const canCopy = !deleted && copyText.trim().length > 0;
  const canReply = Boolean(onReply && hasWaId && !deleted);
  const canForward = hasWaId && channelConnected && !deleted;
  const canDelete = hasWaId && channelConnected && !deleted;

  function closeMenu() {
    setMenu(null);
    setDeleteOpen(false);
    setError(null);
  }

  function runDelete(op: "me" | "everyone") {
    if (!canDelete || pending) return;
    setError(null);
    startTransition(async () => {
      const result =
        op === "everyone"
          ? await deleteMessageForEveryone({
              messageId: m.id,
              conversationId,
            })
          : await deleteMessageForMe({
              messageId: m.id,
              conversationId,
            });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDeleteQueued?.(m.id);
      closeMenu();
    });
  }

  const primaryItems: ItemDef[] = [
    {
      id: "reply",
      label: "Responder",
      disabled: !canReply,
      reason: !hasWaId
        ? "Mensaje aún no sincronizado con WhatsApp"
        : undefined,
      onSelect: () => {
        if (!canReply) return;
        onReply?.({ id: m.id, preview: copyText.slice(0, 120) });
        closeMenu();
      },
    },
    {
      id: "copy",
      label: "Copiar",
      disabled: !canCopy,
      reason: !canCopy ? "No hay texto para copiar" : undefined,
      onSelect: () => {
        if (!canCopy) return;
        void navigator.clipboard.writeText(copyText).then(() => {
          onCopy?.(copyText);
          closeMenu();
        });
      },
    },
    {
      id: "forward",
      label: "Reenviar",
      disabled: !canForward,
      reason: !hasWaId
        ? "Mensaje aún no sincronizado con WhatsApp"
        : !channelConnected
          ? "Canal WhatsApp desconectado"
          : undefined,
      onSelect: () => {
        if (!canForward) return;
        onForward?.(m.id);
        closeMenu();
      },
    },
    {
      id: "delete",
      label: "Eliminar",
      disabled: !canDelete,
      danger: true,
      reason: !hasWaId
        ? "Mensaje aún no sincronizado con WhatsApp"
        : !channelConnected
          ? "Canal WhatsApp desconectado"
          : undefined,
      onSelect: () => setDeleteOpen((v) => !v),
    },
  ];

  const pos = clampMenuPosition(menu.x, menu.y, 220, deleteOpen ? 180 : 200);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Acciones del mensaje"
      className="fixed z-40 min-w-[200px] rounded-2xl border border-[color-mix(in_srgb,var(--color-gris)_18%,transparent)] bg-[var(--bg-surface)] py-1 shadow-lg"
      style={{ left: pos.x, top: pos.y }}
    >
      {primaryItems.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled || pending}
          title={item.disabled ? item.reason : undefined}
          className={`flex min-h-11 w-full items-center px-3 py-2 text-left text-sm touch-manipulation transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
            item.danger
              ? "text-[var(--color-naranja)] hover:bg-[color-mix(in_srgb,var(--color-naranja)_10%,white)] active:bg-[color-mix(in_srgb,var(--color-naranja)_14%,white)]"
              : "text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--color-teal)_10%,white)] active:bg-[color-mix(in_srgb,var(--color-teal)_14%,white)]"
          }`}
          onClick={item.onSelect}
        >
          {item.label}
        </button>
      ))}

      {deleteOpen && canDelete ? (
        <div
          className="border-t border-[color-mix(in_srgb,var(--color-gris)_14%,transparent)] py-1"
          role="group"
          aria-label="Opciones de eliminación"
        >
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            className="flex w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--color-gris)_8%,white)]"
            onClick={() => runDelete("me")}
          >
            Eliminar para mí
          </button>
          {out ? (
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              className="flex w-full px-3 py-2 text-left text-sm text-[var(--color-naranja)] hover:bg-[color-mix(in_srgb,var(--color-naranja)_10%,white)]"
              onClick={() => runDelete("everyone")}
            >
              Eliminar para todos
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="px-3 py-2 text-[11px] text-[var(--color-naranja)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function openMessageContextMenu(state: MenuState) {
  window.dispatchEvent(
    new CustomEvent("thread-message-menu", { detail: state }),
  );
}
