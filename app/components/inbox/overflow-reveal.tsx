"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const HOVER_DELAY_MS = 350;
const MAX_TOOLTIP_CHARS_DEFAULT = 600;
const OPEN_EVENT = "whatsapp-ui:overflow-reveal-open";

type TagName = "span" | "p" | "h1" | "h2" | "li" | "div";

type Props = {
  /** Full string shown in the tooltip when truncated. */
  text: string;
  className?: string;
  as?: TagName;
  children?: ReactNode;
  maxTooltipChars?: number;
  style?: CSSProperties;
};

function prefersDesktopReveal(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function isOverflowing(el: HTMLElement): boolean {
  // Flex/chip wrappers often clip via a truncated child; check descendants too.
  if (el.scrollWidth - el.clientWidth > 1) return true;
  if (el.scrollHeight - el.clientHeight > 1) return true;
  for (const child of el.children) {
    if (child instanceof HTMLElement && isOverflowing(child)) return true;
  }
  return false;
}

function isInsideInteractive(el: HTMLElement): boolean {
  return Boolean(el.closest("a, button, [role='button'], [role='link']"));
}

function clampTooltipText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/**
 * Shows an Acebal-styled tooltip with the full value only when the visible
 * text is truncated. Desktop hover/focus only — no reveal on touch/coarse.
 */
export function OverflowReveal({
  text,
  className,
  as: Tag = "span",
  children,
  maxTooltipChars = MAX_TOOLTIP_CHARS_DEFAULT,
  style,
}: Props) {
  const tipId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [focusable, setFocusable] = useState(false);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearOpenTimer();
    setOpen(false);
    setCoords(null);
  }, [clearOpenTimer]);

  const measureAndPlace = useCallback(() => {
    const el = triggerRef.current;
    if (!el || !prefersDesktopReveal()) return false;
    if (!isOverflowing(el)) {
      setFocusable(false);
      return false;
    }
    if (!isInsideInteractive(el)) setFocusable(true);
    const rect = el.getBoundingClientRect();
    const tipWidth = Math.min(320, window.innerWidth - 16);
    const tipMaxH = 160; // matches max-h-40
    let left = rect.left;
    if (left + tipWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - tipWidth - 8);
    }
    let top = rect.bottom + 6;
    if (top + tipMaxH > window.innerHeight) {
      top = Math.max(8, rect.top - tipMaxH - 6);
    }
    setCoords({ top, left });
    return true;
  }, []);

  const tryOpen = useCallback(() => {
    if (!prefersDesktopReveal()) return;
    if (!measureAndPlace()) {
      close();
      return;
    }
    window.dispatchEvent(
      new CustomEvent(OPEN_EVENT, { detail: { id: tipId } }),
    );
    setOpen(true);
  }, [close, measureAndPlace, tipId]);

  const scheduleOpen = useCallback(() => {
    if (!prefersDesktopReveal()) return;
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => {
      tryOpen();
    }, HOVER_DELAY_MS);
  }, [clearOpenTimer, tryOpen]);

  useEffect(() => {
    const onPeerOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (detail?.id !== tipId) close();
    };
    window.addEventListener(OPEN_EVENT, onPeerOpen);
    return () => window.removeEventListener(OPEN_EVENT, onPeerOpen);
  }, [close, tipId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = () => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [close, open]);

  useEffect(() => () => clearOpenTimer(), [clearOpenTimer]);

  // Keyboard: make non-interactive triggers focusable only when truncated.
  useEffect(() => {
    const el = triggerRef.current;
    if (!el || !prefersDesktopReveal() || isInsideInteractive(el)) {
      setFocusable(false);
      return;
    }
    const sync = () => setFocusable(isOverflowing(el));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [text, className]);

  const onPointerEnter = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch" || e.pointerType === "pen") return;
    if (!prefersDesktopReveal()) return;
    scheduleOpen();
  };

  const onPointerLeave = () => {
    clearOpenTimer();
    close();
  };

  const onFocus = () => {
    if (!prefersDesktopReveal()) return;
    tryOpen();
  };

  const onBlur = () => {
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") close();
  };

  const tooltipText = clampTooltipText(text, maxTooltipChars);
  const showTip = open && coords && text.trim().length > 0;

  return (
    <>
      <Tag
        ref={triggerRef as never}
        tabIndex={focusable ? 0 : undefined}
        aria-describedby={showTip ? tipId : undefined}
        className={
          focusable
            ? `${className ?? ""} outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-1`.trim()
            : className
        }
        style={style}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      >
        {children ?? text}
      </Tag>
      {showTip
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              className="pointer-events-none fixed z-50 max-h-40 max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-[color-mix(in_srgb,var(--color-gris)_18%,transparent)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs leading-snug text-[var(--text-primary)] shadow-lg outline-none"
              style={{ top: coords.top, left: coords.left }}
            >
              <span className="whitespace-pre-wrap break-words">
                {tooltipText}
              </span>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
