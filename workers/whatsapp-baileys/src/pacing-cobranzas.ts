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

function cobranzasPoliticaUrl(sectorSlug: string): string | null {
  const base = process.env.COBRANZAS_SITE_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  const u = new URL("/api/internal/wa-politica", `${base}/`);
  u.searchParams.set("sector_slug", sectorSlug);
  return u.toString();
}

async function fetchCobranzasPolitica(
  sectorSlug: string,
): Promise<WorkerPacingConfig | null> {
  const url = cobranzasPoliticaUrl(sectorSlug);
  const secret = process.env.WA_POLITICA_WORKER_SECRET?.trim();
  if (!url || !secret) return null;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-wa-politica-worker-secret": secret,
      },
      signal: ac.signal,
    });
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          event: "wa_politica_pull_http",
          status: res.status,
          sectorSlug,
        }),
      );
      return null;
    }
    const body = (await res.json()) as {
      ok?: boolean;
      politica?: Record<string, unknown>;
    };
    if (!body?.ok || !body.politica) return null;
    return mapCobranzasPoliticaToConfig(body.politica);
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "wa_politica_pull_error",
        sectorSlug,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Política de campaña para el slug del mensaje (o SECTOR_SLUG del proceso).
 * Cache por slug; si pull falla → env WA_PACING_*.
 */
export async function resolveCampaignPacing(
  clientRef: unknown,
): Promise<ResolvedCampaignPacing> {
  let sectorSlug = sectorSlugFromClientRef(clientRef);
  if (!sectorSlug) {
    try {
      sectorSlug = workerSectorSlug();
    } catch {
      sectorSlug = "contable";
    }
  }

  const now = Date.now();
  const hit = cache.get(sectorSlug);
  if (hit && hit.expiresAt > now) {
    return { cfg: hit.cfg, source: hit.source, sectorSlug };
  }

  const pulled = await fetchCobranzasPolitica(sectorSlug);
  if (pulled) {
    const entry: CacheEntry = {
      cfg: pulled,
      source: "cobranzas",
      expiresAt: now + cacheTtlMs(),
    };
    cache.set(sectorSlug, entry);
    return { cfg: pulled, source: "cobranzas", sectorSlug };
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
