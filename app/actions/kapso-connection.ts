"use server";

import { createClient } from "@/lib/supabase/server";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { requireAdmin } from "@/lib/whatsapp/admin";
import { resolveKapsoPhoneNumberId } from "@/lib/kapso/send-text";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";

export type RefreshKapsoResult =
  | {
      ok: true;
      status: string;
      phone: string | null;
      quality: string | null;
      tier: string | null;
    }
  | { ok: false; error: string };

/** Admin: pull Kapso phone status into whatsapp_connections (no QR). */
export async function refreshKapsoConnectionStatus(): Promise<RefreshKapsoResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Solo admin." };

  const { sector } = await requireActiveSector();
  if (sector.channel_provider !== "kapso") {
    return { ok: false, error: "El sector activo no es Kapso." };
  }

  const supabase = await createClient();
  const connection = await fetchConnectionBySectorId(supabase, sector.id);
  if (!connection) {
    return { ok: false, error: "Sin fila de connection." };
  }

  const phoneNumberId = resolveKapsoPhoneNumberId(
    connection.kapso_phone_number_id,
  );
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  if (!apiKey || !phoneNumberId) {
    return {
      ok: false,
      error: "Faltan KAPSO_API_KEY o KAPSO_PHONE_NUMBER_ID.",
    };
  }

  const res = await fetch(
    `https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/${phoneNumberId}`,
    {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    data?: {
      status?: string | null;
      display_phone_number?: string | null;
      display_phone_number_normalized?: string | null;
      quality_rating?: string | null;
      throughput_tier?: string | null;
      phone_number_id?: string;
    };
    error?: string;
  };

  if (!res.ok) {
    return {
      ok: false,
      error: json.error ?? `Kapso phone lookup failed (${res.status})`,
    };
  }

  const data = json.data;
  // Kapso OpenAPI: status is nullable; do not demote on empty/unknown.
  const metaStatus = (data?.status ?? "").trim().toUpperCase();
  const crmStatus =
    metaStatus === "CONNECTED"
      ? "connected"
      : metaStatus === ""
        ? connection.status === "connected" ||
          Boolean(data?.display_phone_number || data?.display_phone_number_normalized)
          ? "connected"
          : "disconnected"
        : "disconnected";

  const phoneRaw =
    data?.display_phone_number_normalized ||
    data?.display_phone_number ||
    connection.phone;
  const phone = phoneRaw
    ? phoneRaw.startsWith("+")
      ? phoneRaw
      : `+${phoneRaw.replace(/\D/g, "")}`
    : connection.phone;

  const quality = data?.quality_rating ?? null;
  const tier = data?.throughput_tier ?? null;
  const lastError =
    crmStatus === "connected"
      ? null
      : `Kapso status: ${data?.status ?? "unknown"}${quality ? ` · quality ${quality}` : ""}`;

  const { error: updErr } = await supabase
    .from("whatsapp_connections")
    .update({
      status: crmStatus,
      phone,
      kapso_phone_number_id: phoneNumberId,
      qr_payload: null,
      last_error: lastError,
    })
    .eq("id", connection.id);

  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  return {
    ok: true,
    status: crmStatus,
    phone,
    quality,
    tier,
  };
}
