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
      connection: data,
      workerHint:
        "El worker Baileys corre en la VM GCP (PM2), no en Vercel. Sin worker no aparece el QR.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "connection_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
