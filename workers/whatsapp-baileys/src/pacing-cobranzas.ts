/**
 * Pull de wa_envio_politica desde cobranzas (S20).
 * Solo campañas; CRM no usa esto. Cache ~60s; fallback WA_PACING_*.
 */
import {
  loadWorkerPacingConfig,
  type WorkerPacingConfig,
} from "./pacing.js";
import { workerSectorSlug } from "./sector.js";

export type PacingSource = "cobranzas" | "env_fallback";

export type ResolvedCampaignPacing = {
  cfg: WorkerPacingConfig;
  source: PacingSource;
  sectorSlug: string;
};

type CacheEntry = {
  cfg: WorkerPacingConfig;
  source: PacingSource;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

const DEFAULT_CACHE_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

export function clearPacingPoliticaCache() {
  cache.clear();
}

export function sectorSlugFromClientRef(clientRef: unknown): string | null {
  if (!clientRef || typeof clientRef !== "object" || Array.isArray(clientRef)) {
    return null;
  }
  const slug = (clientRef as { wa_sector_slug?: unknown }).wa_sector_slug;
  if (typeof slug !== "string") return null;
  const trimmed = slug.trim();
  return trimmed || null;
}

/** Map JSON cobranzas → WorkerPacingConfig (ADR 004 claves worker). */
export function mapCobranzasPoliticaToConfig(politica: {
  hora_inicio?: unknown;
  hora_fin?: unknown;
  delay_min_seg?: unknown;
  delay_max_seg?: unknown;
  max_msgs_dia?: unknown;
  circuit_429_backoff_min?: unknown;
  tz?: unknown;
}): WorkerPacingConfig {
  const envFallback = loadWorkerPacingConfig();
  const horaInicio = clampInt(politica.hora_inicio, 0, 23, envFallback.horaInicio);
  let horaFin = clampInt(politica.hora_fin, 1, 24, envFallback.horaFin);
  if (horaFin <= horaInicio) horaFin = Math.min(24, horaInicio + 1);

  const delayMinFallbackSeg = Math.max(
    1,
    Math.floor(envFallback.delayMinMs / 1000),
  );
  const delayMaxFallbackSeg = Math.max(
    delayMinFallbackSeg,
    Math.floor(envFallback.delayMaxMs / 1000),
  );
  const delayMinMs = Math.max(
    1000,
    clampInt(politica.delay_min_seg, 1, 3600, delayMinFallbackSeg) * 1000,
  );
  let delayMaxMs = Math.max(
    delayMinMs,
    clampInt(politica.delay_max_seg, 1, 3600, delayMaxFallbackSeg) * 1000,
  );

  return {
    delayMinMs,
    delayMaxMs,
    horaInicio,
    horaFin,
    maxMsgsDia: Math.max(1, clampInt(politica.max_msgs_dia, 1, 10_000, envFallback.maxMsgsDia)),
    circuit429BackoffMin: Math.max(
      1,
      clampInt(
        politica.circuit_429_backoff_min,
        1,
        24 * 60,
        envFallback.circuit429BackoffMin,
      ),
    ),
    tz:
      typeof politica.tz === "string" && politica.tz.trim()
        ? politica.tz.trim()
        : envFallback.tz,
    claimLimit: envFallback.claimLimit,
  };
}

function clampInt(
  raw: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function cacheTtlMs(): number {
  const raw = process.env.WA_POLITICA_CACHE_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_CACHE_MS;
  return Number.isFinite(n) && n >= 5_000 ? n : DEFAULT_CACHE_MS;
}

export async function resolveCampaignPacing(
  clientRef: unknown,
): Promise<ResolvedCampaignPacing> {
  let sectorSlug = sectorSlugFromClientRef(clientRef);
  if (!sectorSlug) {
    try {
      sectorSlug = workerSectorSlug();
    } catch {
      sectorSlug = "wis";
    }
  }

  const now = Date.now();
  const hit = cache.get(sectorSlug);
  if (hit && hit.expiresAt > now) {
    return { cfg: hit.cfg, source: hit.source, sectorSlug };
  }

  const cfg = loadWorkerPacingConfig();
  const entry: CacheEntry = {
    cfg,
    source: "env_fallback",
    expiresAt: now + cacheTtlMs(),
  };
  cache.set(sectorSlug, entry);
  return { cfg, source: "env_fallback", sectorSlug };
}
