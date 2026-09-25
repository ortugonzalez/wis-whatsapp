/**
 * Reloj de cable por origen (ADR 005 / S21).
 * Pure helpers — sin I/O. CRM prioritario + gap ≥ delay_min solo con campaña draining.
 */

export function isCampaignDrainingState(opts: {
  hasCampaignOutbox: boolean;
  campaignCooldownUntilMs: number;
  nowMs: number;
}): boolean {
  return (
    opts.hasCampaignOutbox || opts.campaignCooldownUntilMs > opts.nowMs
  );
}

/** ms hasta poder enviar de nuevo respetando delay_min desde lastWireSendAtMs. */
export function msUntilWireMinGap(opts: {
  lastWireSendAtMs: number;
  delayMinMs: number;
  nowMs: number;
}): number {
  if (opts.lastWireSendAtMs <= 0) return 0;
  const delayMinMs = Math.max(0, opts.delayMinMs);
  return Math.max(0, opts.lastWireSendAtMs + delayMinMs - opts.nowMs);
}

export function nextWakeMs(opts: {
  campaignCooldownUntilMs: number;
  crmWireReadyUntilMs: number;
  nowMs: number;
}): number {
  const a = Math.max(0, opts.campaignCooldownUntilMs - opts.nowMs);
  const b = Math.max(0, opts.crmWireReadyUntilMs - opts.nowMs);
  return Math.max(a, b);
}
