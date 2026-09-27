import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchConnection } from "./db.js";
import { resolveWorkerSectorId } from "./sector.js";

let leaseDeadline = 0;
export function setLeaseDeadline(value: number) { leaseDeadline = value; }
export function hasLease() { return Date.now() < leaseDeadline; }
export function identityMatches(actual: string | null, expected: string | undefined | null) {
  return Boolean(expected && /^\+[1-9]\d{7,14}$/.test(expected) && actual &&
    actual.replace(/\D/g, "") === expected.slice(1));
}
export async function assertOutboundAllowed(db: SupabaseClient, destination?: { phone?: string | null; conversationId?: string | null; campaign?: boolean }) {
  if (process.env.WIS_OUTBOUND_ENABLED !== "true") throw new Error("outbound_disabled");
  if (!hasLease()) throw new Error("worker_lease_lost");
  const conn = await fetchConnection(db);
  if (!conn || conn.status !== "connected" || !identityMatches(conn.phone, process.env.WHATSAPP_EXPECTED_PHONE_E164 || conn.expected_phone_e164)) throw new Error("identity_unverified");
  if (!hasLease()) throw new Error("worker_lease_lost");
  if (!destination) return;
  if (destination.campaign) throw new Error("campaigns_disabled_pending_approval");
  const sector = await resolveWorkerSectorId(db);
  let contactId: string | null = null;
  if (destination.conversationId) {
    const { data, error } = await db.from("conversations").select("contact_id,kind").eq("sector_id", sector).eq("id", destination.conversationId).maybeSingle();
    if (error || !data || data.kind !== "direct") throw new Error("destination_policy_unavailable");
    contactId = data.contact_id;
  }
  let query = db.from("contacts").select("opted_out_at,phone_e164,consent_at,consent_source,consent_scope").eq("sector_id", sector);
  query = contactId ? query.eq("id", contactId) : query.eq("phone_e164", destination.phone ?? "");
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("destination_policy_unavailable");
  if (destination.phone && data.phone_e164 !== destination.phone) throw new Error("destination_mismatch");
  if (data.opted_out_at) throw new Error("recipient_opted_out");
  if (!data.consent_at || !data.consent_source?.trim() || !data.consent_scope?.trim()) throw new Error("recipient_consent_required");
  if (!hasLease()) throw new Error("worker_lease_lost");
}
