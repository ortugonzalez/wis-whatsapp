import { NextResponse } from "next/server";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { requireActiveSectorApi } from "@/lib/sectors/require-active-sector";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/whatsapp/admin";

/** Admin: poll connection status + QR payload. */
export async function GET() {
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

  const supabase = await createClient();
  try {
    const data = await fetchConnectionBySectorId(supabase, active.sector.id);
    return NextResponse.json({
      connection: data ? {...data, qr_payload: data.qr_expires_at && Date.parse(data.qr_expires_at) > Date.now() ? data.qr_payload : null} : null,
      workerHint:
        "El worker local debe estar iniciado para generar el QR y mantener la conexión.",
    }, {headers:{"Cache-Control":"no-store, private"}});
  } catch (e) {
    const message = e instanceof Error ? e.message : "connection_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
