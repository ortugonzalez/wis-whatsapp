/** Long-press (≥500ms) for mobile context menus. Cancels on move >10px. */

import type { MouseEvent, PointerEvent } from "react";

const LONG_MS = 500;
const MOVE_PX = 10;

export type LongPressHandlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  onClickCapture: (e: MouseEvent) => void;
};

type Opts = {
  enabled?: boolean;
  onOpen: (x: number, y: number) => void;
};

export function createLongPressHandlers({
  enabled = true,
  onOpen,
}: Opts): LongPressHandlers {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let suppressReset: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let suppressClick = false;

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function openAt(x: number, y: number) {
    suppressClick = true;
    if (suppressReset) clearTimeout(suppressReset);
    // Some touch browsers never fire click after long-press; don't leave
    // suppress sticky or the next tap on the same row is swallowed.
    suppressReset = setTimeout(() => {
      suppressClick = false;
      suppressReset = null;
    }, 400);
    onOpen(x, y);
  }

  return {
    onPointerDown(e) {
      if (!enabled || e.pointerType === "mouse") return;
      if (e.button !== 0 && e.button !== -1) return;
      clear();
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        openAt(startX, startY);
      }, LONG_MS);
    },
    onPointerMove(e) {
      if (!timer) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (dx * dx + dy * dy > MOVE_PX * MOVE_PX) clear();
    },
    onPointerUp() {
      clear();
    },
    onPointerCancel() {
      clear();
    },
    onContextMenu(e) {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      openAt(e.clientX, e.clientY);
    },
    onClickCapture(e) {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
      if (suppressReset) {
        clearTimeout(suppressReset);
        suppressReset = null;
      }
    },
  };
}
