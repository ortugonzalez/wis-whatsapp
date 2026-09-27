import { randomUUID } from "node:crypto";
import { setLeaseDeadline, hasLease, assertOutboundAllowed } from "./safety.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createWorkerSupabase, fetchConnection, patchConnection, peekWorkerPending } from "./db.js";
import { drainOutbox, msUntilCampaignCooldownEnds } from "./outbox.js";
import { drainLabelOps, drainLabelCatalogOps } from "./labels.js";
import { drainMessageOps } from "./message-ops.js";
import { drainChatReadOps } from "./chat-read-ops.js";
import {
  resolveWorkerSectorId,
  workerSectorSlug,
} from "./sector.js";
import {
  ensureAuthDir,
  startSocket,
  stopSocketLogout,
  type SocketHandles,
} from "./socket.js";

/** Load KEY=VALUE from .env next to cwd (PM2) without printing values. */
function loadEnvFile() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Safety net if Realtime drops; not the idle path. hermes:ceiling 120s → tune 60–120 via env */
const WAKE_DEBOUNCE_MS = 150;
const SAFETY_POLL_DEFAULT_MS = 120_000;
const SAFETY_POLL_MIN_MS = 60_000;
const SAFETY_POLL_MAX_MS = 120_000;

function resolveSafetyPollMs(): number {
  const raw = Number(process.env.WORKER_SAFETY_POLL_MS || SAFETY_POLL_DEFAULT_MS);
  if (!Number.isFinite(raw)) return SAFETY_POLL_DEFAULT_MS;
  return Math.min(SAFETY_POLL_MAX_MS, Math.max(SAFETY_POLL_MIN_MS, raw));
}

const QUEUE_TABLES = [
  "whatsapp_outbox",
  "whatsapp_label_ops",
  "whatsapp_label_catalog_ops",
  "whatsapp_chat_read_ops",
  "whatsapp_message_ops",
] as const;

async function main() {
  loadEnvFile();
  const safetyPollMs = resolveSafetyPollMs();

  const supabaseUrl = process.env.SUPABASE_URL;
  const authDir = process.env.WHATSAPP_AUTH_DIR;
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY || !authDir) {
    throw new Error(
      "Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WHATSAPP_AUTH_DIR",
    );
  }

  ensureAuthDir();
  const supabase = createWorkerSupabase();
  const sectorSlug = workerSectorSlug();
  const sectorId = await resolveWorkerSectorId(supabase);
  console.log(
    JSON.stringify({
      event: "worker_start",
      supabaseUrl,
      authDir,
      sectorSlug,
      sectorId,
      node: process.version,
      safetyPollMs,
      wake: "realtime+safety_poll",
    }),
  );

  const handles: SocketHandles = {
    sock: null,
    messageCache: new Map(),
    starting: false,
  };

  const leaseOwner = randomUUID();
  let leaseConnectionId: string | null = null;
  let observedStatus: string | null = null;
  let tickBusy = false;
  let pendingWake: string | null = null;
  let wakeTimer: ReturnType<typeof setTimeout> | null = null;
  let channel: RealtimeChannel | null = null;
  let stopping = false;

  async function tick(reason: string) {
    if (stopping) return;
    if (tickBusy) {
      pendingWake = reason;
      return;
    }
    tickBusy = true;
    try {
      const conn = await fetchConnection(supabase);
      if (!conn) {
        console.error("no_connection_row");
        return;
      }

      observedStatus = conn.status;
      const { data: acquired, error: leaseError } = await supabase.rpc("wis_acquire_worker_lease", {p_connection_id: conn.id, p_owner: leaseOwner, p_ttl_seconds: 45});
      if (leaseError || !acquired) {
        setLeaseDeadline(0);
        handles.stopped = true;
        handles.sock?.end(new Error("worker_lease_lost"));
        handles.sock = null;
        return;
      }
      leaseConnectionId = conn.id;
      setLeaseDeadline(Date.now() + 35000);
      if (conn.qr_payload && conn.qr_expires_at && Date.parse(conn.qr_expires_at) <= Date.now()) {
        await patchConnection(supabase, {qr_payload: null, qr_expires_at: null});
      }
      if (conn.status === "qr_pending" && !conn.last_error) handles.stopped = false;
      if (conn.status === "disconnected") {
        if (handles.sock) {
          await stopSocketLogout(supabase, handles);
        }
        return;
      }

      if (!handles.sock && !handles.starting) {
        await startSocket(supabase, handles, { forceQr: false });
      }

      if (conn.status === "connected" && handles.sock) {
        if (process.env.WIS_OUTBOUND_ENABLED !== "true") return;
        await assertOutboundAllowed(supabase);
        // S33: peek once; skip empty drains on idle safety poll (Realtime still wakes on INSERT).
        const peek = await peekWorkerPending(supabase, sectorId);
        if (peek.catalog_ops) {
          await drainLabelCatalogOps(handles.sock, supabase);
        }
        if (peek.label_ops) {
          await drainLabelOps(handles.sock, supabase);
        }
        if (peek.chat_read_ops) {
          await drainChatReadOps(handles.sock, supabase);
        }
        if (peek.message_ops) {
          await drainMessageOps(handles.sock, supabase, handles.messageCache);
        }
        if (peek.outbox) {
          await drainOutbox(handles.sock, supabase, handles.messageCache);
        }
        const cooldownMs = msUntilCampaignCooldownEnds();
        if (cooldownMs > 0 && cooldownMs < safetyPollMs) {
          setTimeout(
            () => scheduleTick("outbox_wire_or_campaign_cooldown"),
            cooldownMs + 25,
          );
        }
      }
    } catch (err) {
      console.error("tick_error", { reason, code: "worker_operation_failed" });
    } finally {
      tickBusy = false;
      if (pendingWake && !stopping) {
        const next = pendingWake;
        pendingWake = null;
        void tick(next);
      }
    }
  }

  function scheduleTick(reason: string) {
    if (stopping) return;
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      void tick(reason);
    }, WAKE_DEBOUNCE_MS);
  }

  function subscribeWorkerWake() {
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }

    let ch = supabase.channel("s18a-worker-wake");

    for (const table of QUEUE_TABLES) {
      // INSERT only: claim/requeue UPDATEs are covered by safety poll (avoids wake storms).
      ch = ch.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table },
        () => scheduleTick(`rt_insert:${table}`),
      );
    }

    ch = ch.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "whatsapp_connections" },
      (payload) => { if (payload.new.status !== observedStatus) scheduleTick("rt_update:whatsapp_connections"); },
    );

    channel = ch.subscribe((status, err) => {
      console.log(
        JSON.stringify({
          event: "worker_realtime_status",
          status,
          error: err?.message ?? null,
        }),
      );
      if (status === "SUBSCRIBED") {
        scheduleTick("realtime_subscribed");
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // hermes:ceiling reconnect via safety poll → optional explicit resubscribe later
        scheduleTick(`realtime_${status.toLowerCase()}`);
      }
    });
  }

  subscribeWorkerWake();

  const safetyTimer = setInterval(() => {
    void tick("safety_poll");
  }, 15000);

  const leaseWatchdog = setInterval(() => {
    if (handles.sock && !hasLease()) {
      handles.stopped = true;
      const socket = handles.sock;
      handles.sock = null;
      socket.end(new Error("worker_lease_expired"));
    }
  }, 1000);
  await tick("startup");

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ event: "worker_shutdown", signal }));
    clearInterval(safetyTimer);
    clearInterval(leaseWatchdog);
    handles.stopped = true;
    setLeaseDeadline(0);
    handles.sock?.end(new Error("worker_shutdown"));
    handles.sock = null;
    if (leaseConnectionId) await supabase.rpc("wis_release_worker_lease", { p_connection_id: leaseConnectionId, p_owner: leaseOwner });
    if (wakeTimer) clearTimeout(wakeTimer);
    if (channel) {
      await supabase.removeChannel(channel);
      channel = null;
    }
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((err) => {
  console.error("worker_start_failed_check_local_configuration");
  process.exit(1);
});
