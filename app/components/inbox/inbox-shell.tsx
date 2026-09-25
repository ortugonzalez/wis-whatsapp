"use client";

import { useEffect, useRef } from "react";

type Props = {
  children: React.ReactNode;
};

/** Viewport-locked chrome: page never scrolls; only lista/hilo do. */
export function InboxShell({ children }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const shell = shellRef.current;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    const pin = () => {
      if (!shell) return;
      if (shell.scrollTop !== 0) shell.scrollTop = 0;
      if (shell.scrollLeft !== 0) shell.scrollLeft = 0;
    };

    pin();
    shell?.addEventListener("scroll", pin, { passive: true });
    document.addEventListener("focusin", pin);

    return () => {
      shell?.removeEventListener("scroll", pin);
      document.removeEventListener("focusin", pin);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, []);

  return (
    <div
      ref={shellRef}
      className="fixed inset-0 flex flex-col overflow-clip overscroll-none bg-[var(--bg-base)]"
    >
      {children}
    </div>
  );
}
