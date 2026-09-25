import { NextResponse } from "next/server";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { requireActiveSectorApi } from "@/lib/sectors/require-active-sector";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/whatsapp/admin";

/** Admin: request QR / (re)link. Worker sees qr_pending and publishes QR. */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const active = await requireActiveSectorApi();
  if (!active.ok) {
    return NextResponse.json(
      { error: active.error },
      { status: active.status },
    );
  }

  if (active.sector.channel_provider === "kapso") {
    return NextResponse.json(
      {
        error: "kapso_no_qr",
        hint: "Este sector usa Kapso. Actualizá el estado en Configurar canal.",
      },
      { status: 409 },
    );
  }

  const supabase = await createClient();
  let current;
  try {
    current = await fetchConnectionBySectorId(supabase, active.sector.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "read_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!current) {
    return NextResponse.json({ error: "missing_connection" }, { status: 500 });
  }

  // Demoting connected→qr_pending while the VM socket stays open stalls outbox drain.
  if (current.status === "connected") {
    return NextResponse.json(
      {
        error: "already_connected",
        hint: "Desconectá primero si necesitás un QR nuevo.",
      },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("whatsapp_connections")
    .update({
      status: "qr_pending",
      qr_payload: null,
      last_error: null,
    })
    .eq("sector_id", current.sector_id)
    .select("id, sector_id, status, qr_payload, phone, last_error")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ connection: data });
}
