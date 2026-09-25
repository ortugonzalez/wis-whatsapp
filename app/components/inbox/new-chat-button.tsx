"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { startNewChat } from "@/app/actions/new-chat";

type Props = {
  channelConnected: boolean;
};

function NewChatIcon() {
  return (
    <span
      aria-hidden
      className="inline-block h-[18px] w-[18px] bg-current"
      style={{
        WebkitMask: "url(/icons/new-chat.png) center / contain no-repeat",
        mask: "url(/icons/new-chat.png) center / contain no-repeat",
      }}
    />
  );
}

export function NewChatButton({ channelConnected }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startNewChat({ phone, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPhone("");
      setBody("");
      setOpen(false);
      router.push(`/c/${result.conversationId}`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--color-gris)_22%,transparent)] bg-[var(--bg-surface)] text-[var(--text-primary)] touch-manipulation transition-colors hover:border-[var(--color-teal)] hover:text-[var(--color-teal)] active:border-[var(--color-teal)] active:text-[var(--color-teal)] disabled:opacity-50"
        disabled={!channelConnected}
        aria-label={
          channelConnected
            ? "Nuevo chat"
            : "Canal desconectado — no se puede iniciar un chat"
        }
        title={
          channelConnected
            ? "Nuevo chat"
            : "Canal desconectado — no se puede iniciar un chat"
        }
        onClick={() => setOpen(true)}
      >
        <NewChatIcon />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-[min(100vw-2rem,24rem)] rounded-2xl border border-[color-mix(in_srgb,var(--color-gris)_14%,transparent)] bg-[var(--bg-surface)] p-0 text-[var(--text-primary)] shadow-lg backdrop:bg-black/40"
        onClose={close}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <form onSubmit={submit} className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 id={titleId} className="font-heading text-base font-bold">
              Nuevo chat
            </h2>
            <button
              type="button"
              className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--color-naranja)]"
              onClick={close}
            >
              Cerrar
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Celular argentino. Si el número no está en WhatsApp, el envío falla y
            el worker limpia la conversación vacía.
          </p>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Teléfono
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+54 9 3469…"
              className="h-11 rounded-lg border border-[color-mix(in_srgb,var(--color-gris)_22%,transparent)] bg-white px-3 text-base font-normal outline-none focus:border-[var(--color-teal)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Primer mensaje
            <textarea
              required
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribí el mensaje…"
              className="rounded-lg border border-[color-mix(in_srgb,var(--color-gris)_22%,transparent)] bg-white px-3 py-2 text-base font-normal outline-none focus:border-[var(--color-teal)]"
            />
          </label>
          {error ? (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="btn-institucional-solid h-11 w-full text-sm disabled:opacity-60"
          >
            {pending ? "Enviando…" : "Crear y enviar"}
          </button>
        </form>
      </dialog>
    </>
  );
}
