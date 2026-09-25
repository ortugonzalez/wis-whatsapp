/**
 * Pacing anti-ban (práctica operativa, no API oficial).
 * Solo filas de campaña cobranzas (`client_ref.source`); CRM/send-test = inmediato.
 * Aplica en cualquier sector/worker — el origen del mensaje manda, no el slug.
 */

export type WorkerPacingConfig = {
  delayMinMs: number;
  delayMaxMs: number;
  horaInicio: number;
  horaFin: number;
  maxMsgsDia: number;
  circuit429BackoffMin: number;
  tz: string;
  claimLimit: number;
};

/** Campaña cobranzas → paced. CRM / send-test / resto → sin pacing. */
export function isCobranzasCampaignRef(clientRef: unknown): boolean {
  if (!clientRef || typeof clientRef !== "object" || Array.isArray(clientRef)) {
    return false;
  }
  const source = (clientRef as { source?: unknown }).source;
  return source === "cobranzas" || source === "cobranzas_campaign";
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Defaults alineados al contrato cobranzas (50–90s, 9–13, 80/día). */
export function loadWorkerPacingConfig(): WorkerPacingConfig {
  const delayMinMs = Math.max(1000, numEnv("WA_PACING_DELAY_MIN_MS", 50_000));
  let delayMaxMs = Math.max(delayMinMs, numEnv("WA_PACING_DELAY_MAX_MS", 90_000));
  const horaInicio = Math.min(23, Math.max(0, numEnv("WA_PACING_HORA_INICIO", 9)));
  let horaFin = Math.min(24, Math.max(1, numEnv("WA_PACING_HORA_FIN", 13)));
  if (horaFin <= horaInicio) horaFin = Math.min(24, horaInicio + 1);
  return {
    delayMinMs,
    delayMaxMs,
    horaInicio,
    horaFin,
    maxMsgsDia: Math.max(1, numEnv("WA_PACING_MAX_MSGS_DIA", 80)),
    circuit429BackoffMin: Math.max(1, numEnv("WA_PACING_CIRCUIT_429_MIN", 30)),
    tz: process.env.WA_PACING_TZ?.trim() || "America/Argentina/Buenos_Aires",
    // Con delay entre msgs, claim 1 evita ráfaga de 5.
    claimLimit: Math.min(5, Math.max(1, numEnv("WA_PACING_CLAIM_LIMIT", 1))),
  };
}

const FALLBACK_TZ = "America/Argentina/Buenos_Aires";

function safeTz(tz: string): string {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return FALLBACK_TZ;
  }
}

export function hourNowInTz(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz(tz),
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  if (h === 24) return 0;
  return Number.isFinite(h) ? h : 0;
}

export function todayDateInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isWithinSendWindow(cfg: WorkerPacingConfig): boolean {
  const h = hourNowInTz(cfg.tz);
  return h >= cfg.horaInicio && h < cfg.horaFin;
}

export function jitterDelayMs(cfg: WorkerPacingConfig): number {
  const span = cfg.delayMaxMs - cfg.delayMinMs;
  if (span <= 0) return cfg.delayMinMs;
  return cfg.delayMinMs + Math.floor(Math.random() * (span + 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    const s = String(err);
    return s.includes("429") || /rate.?limit/i.test(s);
  }
  const any = err as {
    output?: { statusCode?: number };
    status?: number;
    message?: string;
  };
  if (any.output?.statusCode === 429) return true;
  if (any.status === 429) return true;
  const msg = any.message ?? String(err);
  return msg.includes("429") || /rate.?limit/i.test(msg);
}
