import { NextResponse } from "next/server";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { requireActiveSectorApi } from "@/lib/sectors/require-active-sector";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/whatsapp/admin";

const E164_RE = /^\+[1-9][0-9]{6,14}$/;

/** Admin: enqueue one text row for phone smoke (readable on device). */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { to_e164?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const to = (body.to_e164 ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!E164_RE.test(to)) {
    return NextResponse.json(
      { error: "invalid_e164", hint: "Usá formato +54911…" },
      { status: 400 },
    );
  }
  if (!text || text.length > 1000) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
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
        error: "kapso_no_baileys_outbox",
        hint: "Este sector usa Kapso; el test Baileys no aplica. Enviá desde la bandeja.",
      },
      { status: 409 },
    );
  }

  const supabase = await createClient();
  let connection;
  try {
    connection = await fetchConnectionBySectorId(supabase, active.sector.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "missing_connection" },
      { status: 500 },
    );
  }
  if (!connection) {
    return NextResponse.json({ error: "missing_connection" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("whatsapp_outbox")
    .insert({
      sector_id: connection.sector_id,
      to_e164: to,
      type: "text",
      body: text,
      sent_by: admin.profile.id,
      status: "pending",
    })
    .select(
      "id, to_e164, type, body, status, attempts, sent_by, created_at, updated_at",
    )
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ outbox: data });
}
