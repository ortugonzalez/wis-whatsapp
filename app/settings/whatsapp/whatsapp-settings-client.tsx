"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { refreshKapsoConnectionStatus } from "@/app/actions/kapso-connection";
import { runKapsoHistoryBackfillPage } from "@/app/actions/kapso-backfill";
import type { ChannelProvider } from "@/lib/sectors/connection";
import type { WhatsappConnection } from "@/lib/supabase/types";

type ConnectionResponse = {
  connection: WhatsappConnection | null;
  workerHint?: string;
};

type Props = {
  sectorDisplayName: string;
  channelProvider: ChannelProvider;
};

export function WhatsappSettingsClient({
  sectorDisplayName,
  channelProvider,
}: Props) {
  const isKapso = channelProvider === "kapso";
  const [connection, setConnection] = useState<WhatsappConnection | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [toE164, setToE164] = useState("+549");
  const [testBody, setTestBody] = useState("Test message");
  const [backfillNote, setBackfillNote] = useState<string | null>(null);
  const [backfillAfter, setBackfillAfter] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const qrPayload = connection?.qr_payload ?? null;
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/whatsapp/connection", { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 403 ? "Admin only." : "Could not read status.");
      return;
    }
    const json = (await res.json()) as ConnectionResponse;
    setConnection(json.connection);
    setHint(json.workerHint ?? null);
    setError(null);
  }, []);

  const runKapsoRefresh = useCallback(async () => {
    setError(null);
    const result = await refreshKapsoConnectionStatus();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setQuality(result.quality);
    setTier(result.tier);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      queueMicrotask(() => {
        if (isKapso) {
          startTransition(() => {
            void runKapsoRefresh();
          });
        } else {
          void refresh();
        }
      });
    }
    if (isKapso) return;
    const id = setInterval(() => {
      void refresh();
    }, 2500);
    return () => clearInterval(id);
  }, [refresh, runKapsoRefresh, isKapso, startTransition]);

  useEffect(() => {
    let cancelled = false;
    if (isKapso || !qrPayload) {
      queueMicrotask(() => {
        if (!cancelled) setQrDataUrl(null);
      });
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(qrPayload, { width: 280, margin: 2 });
      if (!cancelled) setQrDataUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [qrPayload, isKapso]);

  function postAction(path: string) {
    startTransition(async () => {
      setError(null);
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          hint?: string;
        };
        setError(json.hint ?? json.error ?? "Action failed.");
        return;
      }
      await refresh();
    });
  }

  function refreshKapso() {
    startTransition(() => {
      void runKapsoRefresh();
    });
  }

  function runBackfill(dryRun: boolean) {
    startTransition(async () => {
      setError(null);
      setBackfillNote(null);
      const after = dryRun ? null : backfillAfter;
      const result = await runKapsoHistoryBackfillPage({
        dryRun,
        limit: 20,
        after,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!dryRun) {
        setBackfillAfter(result.after);
      }
      setBackfillNote(
        `${dryRun ? "Dry-run" : "Import"}: scanned ${result.scanned}, ` +
          `${dryRun ? "candidates" : "inserted"} ${result.inserted}, ` +
          `already existed ${result.skippedExisting}, no phone ${result.skippedNoPhone}, ` +
          `media skipped ${result.mediaSkipped}` +
          (result.after
            ? dryRun
              ? " · more pages"
              : " · more (next Import uses cursor)"
            : " · end of history"),
      );
    });
  }

  function sendTest() {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_e164: toE164.trim(), body: testBody.trim() }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          hint?: string;
        };
        setError(json.hint ?? json.error ?? "Could not queue test.");
        return;
      }
      await refresh();
    });
  }

  const status = connection?.status ?? "…";

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Channel status</h2>
        <p className="text-sm text-neutral-600">
          Sector:{" "}
          <span className="font-medium text-neutral-900">
            {sectorDisplayName}
          </span>
          {isKapso ? " · Kapso" : " · Baileys"}
        </p>
        <p className="text-sm text-neutral-600">
          Status:{" "}
          <span className="font-medium text-neutral-900">{status}</span>
          {connection?.phone ? ` · ${connection.phone}` : null}
          {quality ? ` · quality ${quality}` : null}
          {tier ? ` · tier ${tier}` : null}
        </p>
        {connection?.kapso_phone_number_id && isKapso ? (
          <p className="text-xs text-neutral-500">
            phone_number_id: {connection.kapso_phone_number_id}
          </p>
        ) : null}
        {connection?.last_error ? (
          <p className="text-sm text-amber-800" role="status">
            {connection.last_error}
          </p>
        ) : null}
        {hint && !isKapso ? (
          <p className="text-sm text-neutral-500">{hint}</p>
        ) : null}
      </section>

      {isKapso ? (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={refreshKapso}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Refresh Kapso status
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => runBackfill(true)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              Dry-run history (1 page)
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => runBackfill(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              Import 1 page
            </button>
          </div>
          {backfillNote ? (
            <p className="text-sm text-neutral-600" role="status">
              {backfillNote}
            </p>
          ) : (
            <p className="text-sm text-neutral-500">
              Backfill: Platform API → upsert by wamid. Media: placeholder only
              (no download to Storage).
            </p>
          )}
        </section>
      ) : (
        <section className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => postAction("/api/whatsapp/connect")}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            Connect / show QR
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => postAction("/api/whatsapp/disconnect")}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Disconnect
          </button>
        </section>
      )}

      {!isKapso && qrDataUrl && connection?.status === "qr_pending" ? (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Scan QR</h2>
          <p className="text-sm text-neutral-600">
            WhatsApp Business → Linked devices → Link a device.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR code to link WhatsApp"
            width={280}
            height={280}
            className="rounded-md border border-neutral-200 bg-white p-2"
          />
        </section>
      ) : null}

      {!isKapso ? (
        <section className="space-y-3 border-t border-neutral-200 pt-6">
          <h2 className="text-lg font-medium">Test message</h2>
          <p className="text-sm text-neutral-600">
            Queues a text in the outbox. Confirm on the destination phone that it
            arrives (status sent in DB is not enough).
          </p>
          <label className="block space-y-1 text-sm">
            <span className="text-neutral-700">Destination E.164</span>
            <input
              value={toE164}
              onChange={(e) => setToE164(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
              placeholder="+54911…"
              inputMode="tel"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-neutral-700">Text</span>
            <input
              value={testBody}
              onChange={(e) => setTestBody(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={pending || connection?.status !== "connected"}
            onClick={sendTest}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Send test
          </button>
        </section>
      ) : (
        <p className="text-sm text-neutral-600 border-t border-neutral-200 pt-6">
          Kapso test send is done from the inbox (24 h window). Campaigns go via
          collections.
        </p>
      )}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}