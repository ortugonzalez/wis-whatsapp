import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/whatsapp/admin";
import { requireActiveSectorApi } from "@/lib/sectors/require-active-sector";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"invalid_origin"},{status:403});
  if (!await requireAdmin()) return NextResponse.json({error:"forbidden"},{status:403});
  const active = await requireActiveSectorApi();
  if (!active.ok) return NextResponse.json({error:active.error},{status:active.status});
  const body = await request.json().catch(()=>null);
  const expected = typeof body?.expected_phone_e164 === "string" ? body.expected_phone_e164.trim() : "";
  if (!/^\+[1-9]\d{7,14}$/.test(expected)) return NextResponse.json({error:"invalid_phone",hint:"Ingresá el número completo en formato E.164: signo +, código de país y número, sin espacios."},{status:400});
  if (active.sector.slug === "wis-5679" && !expected.endsWith("5679")) return NextResponse.json({error:"unexpected_line",hint:"Esta conexión está reservada para la línea terminada en 5679."},{status:400});
  const db = await createClient();
  try {
    const current = await fetchConnectionBySectorId(db, active.sector.id);
    if (!current) return NextResponse.json({error:"missing_connection"},{status:404});
    if (current.status === "connected" && current.phone?.replace(/\D/g,"") !== expected.slice(1)) return NextResponse.json({error:"identity_mismatch",hint:"El número ingresado no coincide con la identidad de la línea conectada. Revisá la cuenta antes de continuar."},{status:409});
    const {data,error} = await db.from("whatsapp_connections").update({expected_phone_e164:expected}).eq("id",current.id).eq("sector_id",active.sector.id).eq("updated_at",current.updated_at).select("id,expected_phone_e164").maybeSingle();
    if (error) return NextResponse.json({error:"identity_update_failed"},{status:500});
    if (!data) return NextResponse.json({error:"connection_changed",hint:"La conexión cambió mientras confirmabas. Actualizá y volvé a revisar la identidad."},{status:409});
    return NextResponse.json({data},{headers:{"Cache-Control":"no-store, private"}});
  } catch { return NextResponse.json({error:"connection_unavailable"},{status:503}); }
}
