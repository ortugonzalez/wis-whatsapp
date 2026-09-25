/**
 * Self-check copy fijo S22.
 * Run: npx tsx lib/inbox/campaign-draining-copy.selfcheck.ts
 */
import { CAMPAIGN_DRAINING_BANNER_COPY } from "./campaign-draining-copy.js";

const expected = "Campaña en curso - Preferí responder desde otro canal";
if (CAMPAIGN_DRAINING_BANNER_COPY !== expected) {
  throw new Error(`banner copy mismatch: ${CAMPAIGN_DRAINING_BANNER_COPY}`);
}
console.log("SMOKE_OK campaign-draining-copy");
