"use client";

import { useEffect, useState } from "react";

type Props = {
  message: string | null;
  onDone?: () => void;
};

export function MessageToast({ message, onDone }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  if (!message || !visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white shadow-lg"
    >
      {message}
    </div>
  );
}
