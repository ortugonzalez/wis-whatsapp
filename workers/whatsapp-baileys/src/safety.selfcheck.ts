import { test } from "node:test";
import assert from "node:assert/strict";
import { identityMatches, hasLease, setLeaseDeadline, assertOutboundAllowed } from "./safety.js";
import type { SupabaseClient } from "@supabase/supabase-js";

test("identity requires a complete E164 and exact identity, not suffix", () => {
  assert.equal(identityMatches("5491111115679", "+5491111115679"), true);
  assert.equal(identityMatches("5491111115679", "5679"), false);
  assert.equal(identityMatches("5491111115679", "+5492222225679"), false);
  assert.equal(identityMatches("5491111115679", undefined), false);
});
test("lease expires and outbound is fail-closed before DB/network access", async () => {
  setLeaseDeadline(Date.now() - 1);
  assert.equal(hasLease(), false);
  const db = {} as SupabaseClient;
  delete process.env.WIS_OUTBOUND_ENABLED;
  await assert.rejects(assertOutboundAllowed(db), /outbound_disabled/);
  process.env.WIS_OUTBOUND_ENABLED = "true";
  await assert.rejects(assertOutboundAllowed(db), /worker_lease_lost/);
  delete process.env.WIS_OUTBOUND_ENABLED;
});
