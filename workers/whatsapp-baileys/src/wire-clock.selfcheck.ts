/**
 * Self-check wire-clock (S21). Sin red.
 * Run: npx tsx src/wire-clock.selfcheck.ts
 */
import {
  isCampaignDrainingState,
  msUntilWireMinGap,
  nextWakeMs,
} from "./wire-clock.js";

const now = 1_000_000;

if (
  !isCampaignDrainingState({
    hasCampaignOutbox: true,
    campaignCooldownUntilMs: 0,
    nowMs: now,
  })
) {
  throw new Error("outbox pending should drain");
}
if (
  !isCampaignDrainingState({
    hasCampaignOutbox: false,
    campaignCooldownUntilMs: now + 5_000,
    nowMs: now,
  })
) {
  throw new Error("active cooldown should drain");
}
if (
  isCampaignDrainingState({
    hasCampaignOutbox: false,
    campaignCooldownUntilMs: now - 1,
    nowMs: now,
  })
) {
  throw new Error("idle should not drain");
}

if (
  msUntilWireMinGap({
    lastWireSendAtMs: 0,
    delayMinMs: 50_000,
    nowMs: now,
  }) !== 0
) {
  throw new Error("no prior send → ready");
}
if (
  msUntilWireMinGap({
    lastWireSendAtMs: now - 10_000,
    delayMinMs: 50_000,
    nowMs: now,
  }) !== 40_000
) {
  throw new Error("partial gap");
}
if (
  msUntilWireMinGap({
    lastWireSendAtMs: now - 60_000,
    delayMinMs: 50_000,
    nowMs: now,
  }) !== 0
) {
  throw new Error("gap satisfied");
}

if (
  nextWakeMs({
    campaignCooldownUntilMs: now + 30_000,
    crmWireReadyUntilMs: now + 10_000,
    nowMs: now,
  }) !== 30_000
) {
  throw new Error("wake max of both");
}

console.log("SMOKE_OK wire-clock selfcheck");
