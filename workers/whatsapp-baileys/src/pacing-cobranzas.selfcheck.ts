/**
 * Self-check map + slug helpers (S20). Sin red.
 * Run: npx tsx src/pacing-cobranzas.selfcheck.ts
 */
import {
  clearPacingPoliticaCache,
  mapCobranzasPoliticaToConfig,
  sectorSlugFromClientRef,
} from "./pacing-cobranzas.js";

clearPacingPoliticaCache();

if (sectorSlugFromClientRef({ source: "cobranzas", wa_sector_slug: "tesoreria" }) !== "tesoreria") {
  throw new Error("slug from client_ref");
}
if (sectorSlugFromClientRef({ source: "cobranzas" }) !== null) {
  throw new Error("missing slug should be null");
}
if (sectorSlugFromClientRef(null) !== null) {
  throw new Error("null ref");
}

const cfg = mapCobranzasPoliticaToConfig({
  hora_inicio: 7,
  hora_fin: 12,
  delay_min_seg: 20,
  delay_max_seg: 60,
  max_msgs_dia: 200,
  circuit_429_backoff_min: 30,
  tz: "America/Argentina/Buenos_Aires",
});

if (cfg.horaInicio !== 7 || cfg.horaFin !== 12) {
  throw new Error(`ventana map ${cfg.horaInicio}-${cfg.horaFin}`);
}
if (cfg.delayMinMs !== 20_000 || cfg.delayMaxMs !== 60_000) {
  throw new Error(`delay map ${cfg.delayMinMs}-${cfg.delayMaxMs}`);
}
if (cfg.maxMsgsDia !== 200) throw new Error("max_msgs_dia");

const envCfg = mapCobranzasPoliticaToConfig({
  hora_inicio: 9,
  hora_fin: 13,
  max_msgs_dia: 80,
  circuit_429_backoff_min: 30,
  tz: "America/Argentina/Buenos_Aires",
});
if (envCfg.delayMinMs < 1000 || envCfg.delayMaxMs < envCfg.delayMinMs) {
  throw new Error("delay fallback from WA_PACING_* / defaults");
}

// hora_fin <= hora_inicio → bump
const bad = mapCobranzasPoliticaToConfig({
  hora_inicio: 10,
  hora_fin: 10,
  delay_min_seg: 50,
  delay_max_seg: 90,
  max_msgs_dia: 80,
  circuit_429_backoff_min: 30,
  tz: "America/Argentina/Buenos_Aires",
});
if (bad.horaFin <= bad.horaInicio) throw new Error("hora_fin bump failed");

console.log("SMOKE_OK pacing-cobranzas selfcheck", {
  horaInicio: cfg.horaInicio,
  delayMinMs: cfg.delayMinMs,
  maxMsgsDia: cfg.maxMsgsDia,
});
