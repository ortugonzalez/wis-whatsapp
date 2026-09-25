"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sendOutboundMessage,
  uploadOutboundMedia,
} from "@/app/actions/send-message";
import { OverflowReveal } from "@/app/components/inbox/overflow-reveal";

export type QuoteTarget = {
  id: string;
  preview: string;
};

/** Local-only failed send (enqueue never created a CRM row). */
export type ComposerEnqueueFailure = {
  clientId: string;
  body: string;
  quotedMessageId: string | null;
  error: string;
};

type Props = {
  conversationId: string;
  channelConnected: boolean;
  /** null = not Kapso (Baileys): no 24h UI. false = Kapso outside window. */
  kapsoWindowOpen?: boolean | null;
  quote?: QuoteTarget | null;
  onClearQuote?: () => void;
  /** Enqueue failed before a CRM message existed — show in thread with retry. */
  onEnqueueFailed?: (failure: ComposerEnqueueFailure) => void;
  /** Imperative focus handle for retry buttons in the thread. */
  focusSignal?: number;
};

const MAX_RECORD_MS = 60_000;
const MAX_TEXTAREA_ROWS = 4;
const TEXTAREA_MIN_HEIGHT_PX = 44;

function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/ogg;codecs=opus",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

function extForMime(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  return "webm";
}

function PaperclipIcon() {
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
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function MicIcon() {
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
      <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <path d="M12 19v4" />
      <path d="M8 23h8" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="currentColor"
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function focusComposer(ta: HTMLTextAreaElement | null) {
  if (!ta) return;
  ta.focus({ preventScroll: true });
}

export function Composer({
  conversationId,
  channelConnected,
  kapsoWindowOpen = null,
  quote = null,
  onClearQuote,
  onEnqueueFailed,
  focusSignal = 0,
}: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (focusSignal > 0) {
      focusComposer(textareaRef.current);
    }
  }, [focusSignal]);

  const syncTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    ta.style.height = `${TEXTAREA_MIN_HEIGHT_PX}px`;
    const style = getComputedStyle(ta);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const padding =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const border =
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const maxHeight = lineHeight * MAX_TEXTAREA_ROWS + padding + border;
    const scrollHeight = ta.scrollHeight;
    const next = Math.min(
      Math.max(scrollHeight, TEXTAREA_MIN_HEIGHT_PX),
      maxHeight,
    );
    ta.style.height = `${next}px`;
    ta.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    syncTextareaHeight();
  }, [text, syncTextareaHeight]);

  function sendText() {
    const body = text.trim();
    if (!body || !channelConnected || recording || kapsoWindowOpen === false)
      return;

    const quotedMessageId = quote?.id ?? null;
    setText("");
    onClearQuote?.();
    setError(null);
    // Keep caret in the composer for the next message (Enter or Send).
    focusComposer(textareaRef.current);

    void (async () => {
      const result = await sendOutboundMessage({
        conversationId,
        type: "text",
        body,
        quotedMessageId,
      });
      focusComposer(textareaRef.current);
      if (result.ok) return;
      onEnqueueFailed?.({
        clientId: `local:${crypto.randomUUID()}`,
        body,
        quotedMessageId,
        error: result.error,
      });
    })();
  }

  function onPickFile(file: File | null) {
    if (!file || mediaBusy) return;
    setError(null);
    setMediaBusy(true);
    void (async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        const uploaded = await uploadOutboundMedia(fd);
        if (!uploaded.ok) {
          setError(uploaded.error);
          return;
        }
        const result = await sendOutboundMessage({
          conversationId,
          type: uploaded.type,
          body: file.name,
          mediaBucketPath: uploaded.path,
          quotedMessageId: quote?.id ?? null,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onClearQuote?.();
        if (fileRef.current) fileRef.current.value = "";
      } finally {
        setMediaBusy(false);
        focusComposer(textareaRef.current);
      }
    })();
  }

  function cleanupRecorder() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordSecs(0);
  }

  async function startRecording() {
    setError(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite grabar audio.");
      return;
    }
    const mime = pickRecorderMime();
    if (mime === null) {
      setError("MediaRecorder no está disponible en este navegador.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Permiso de micrófono denegado. Habilitá el mic en el navegador e intentá de nuevo.",
        );
      } else if (name === "NotFoundError") {
        setError("No se encontró un micrófono.");
      } else {
        setError("No se pudo acceder al micrófono.");
      }
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const recorder =
      mime && mime.length > 0
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };

    recorder.onstop = () => {
      const rawMime = recorder.mimeType || mime || "audio/webm";
      const usedMime = rawMime.split(";")[0].trim() || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: usedMime });
      cleanupRecorder();
      if (blob.size === 0) {
        setError("La grabación quedó vacía.");
        return;
      }
      const file = new File(
        [blob],
        `nota-voz.${extForMime(usedMime)}`,
        { type: usedMime },
      );
      onPickFile(file);
    };

    recorder.start(250);
    setRecording(true);
    setRecordSecs(0);
    timerRef.current = setInterval(() => {
      setRecordSecs((s) => s + 1);
    }, 1000);
    stopTimerRef.current = setTimeout(() => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }, MAX_RECORD_MS);
  }

  function stopRecording() {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.stop();
    } else {
      cleanupRecorder();
    }
  }

  function cancelRecording() {
    const rec = mediaRecorderRef.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = () => cleanupRecorder();
      if (rec.state === "recording") rec.stop();
      else cleanupRecorder();
    } else {
      cleanupRecorder();
    }
    chunksRef.current = [];
  }

  const outsideKapsoWindow = kapsoWindowOpen === false;
  const textBlocked =
    !channelConnected || recording || outsideKapsoWindow;

  return (
    <div className="safe-pad-bottom-composer z-20 shrink-0 border-t border-[color-mix(in_srgb,var(--color-gris)_12%,transparent)] bg-[var(--bg-surface)] px-3 pt-3">
      {!channelConnected ? (
        <p className="mb-2 rounded-lg bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] px-3 py-2 text-sm text-[var(--text-primary)]">
          Canal desconectado: no se pueden enviar mensajes hasta que un admin
          vincule WhatsApp.
        </p>
      ) : null}
      {channelConnected && outsideKapsoWindow ? (
        <p
          className="mb-2 rounded-lg bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] px-3 py-2 text-sm text-[var(--text-primary)]"
          role="status"
        >
          Fuera de la ventana de 24 h: el vecino tiene que escribir primero.
          Las plantillas de campaña las envía cobranzas, no este panel.
        </p>
      ) : null}
      {error ? (
        <p
          className="mb-2 rounded-lg bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-sm text-[var(--danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {quote ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-[var(--color-naranja)] bg-[color-mix(in_srgb,var(--color-naranja)_10%,white)] px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-[var(--color-naranja)]">
              Citando
            </p>
            <OverflowReveal
              as="p"
              text={quote.preview}
              className="truncate text-[var(--text-secondary)]"
            />
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-xs font-medium text-[var(--text-muted)] touch-manipulation active:text-[var(--danger)] hover:text-[var(--danger)]"
            onClick={() => onClearQuote?.()}
            disabled={recording}
          >
            Cancelar
          </button>
        </div>
      ) : null}
      {recording ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--danger)_10%,white)] px-3 py-2 text-sm">
          <span className="font-medium text-[var(--danger)]" aria-live="polite">
            Grabando… {recordSecs}s / 60s
          </span>
          <button
            type="button"
            className="btn-institucional-solid px-3 py-1.5 text-sm"
            onClick={stopRecording}
          >
            Enviar audio
          </button>
          <button
            type="button"
            className="btn-institucional px-3 py-1.5 text-sm"
            onClick={cancelRecording}
          >
            Descartar
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label
          className="btn-institucional inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center p-0"
          aria-label="Adjuntar archivo"
          title="Adjuntar archivo"
        >
          <PaperclipIcon />
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept="image/*,audio/*,.pdf,application/pdf"
            disabled={
              mediaBusy || !channelConnected || recording || outsideKapsoWindow
            }
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className="btn-institucional inline-flex h-11 w-11 shrink-0 items-center justify-center p-0"
          disabled={
            mediaBusy || !channelConnected || recording || outsideKapsoWindow
          }
          onClick={() => void startRecording()}
          aria-label="Grabar audio"
          title="Grabar audio"
        >
          <MicIcon />
        </button>
        <textarea
          ref={textareaRef}
          className="input-institucional composer-textarea min-h-11 flex-1 resize-none px-3 py-2 text-base leading-5"
          rows={1}
          placeholder={quote ? "Respuesta a la cita…" : "Escribí un mensaje…"}
          value={text}
          disabled={textBlocked}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendText();
            }
          }}
        />
        <button
          type="button"
          className="btn-institucional-solid inline-flex h-11 w-11 shrink-0 items-center justify-center p-0"
          disabled={textBlocked || !text.trim()}
          onMouseDown={(e) => {
            // Prevent button focus from stealing caret before sendText runs.
            e.preventDefault();
          }}
          onClick={sendText}
          aria-label="Enviar"
          title="Enviar"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
