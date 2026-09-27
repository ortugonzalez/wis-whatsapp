import Link from "next/link";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { DashboardTools } from "./tools";
import { Campaigns } from "./campaigns";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";

export default async function Dashboard() {
  const { profile, sector } = await requireActiveSector();
  const db = await createClient();
  const [connection, contacts, conversations, queued, unknown] = await Promise.all([
    fetchConnectionBySectorId(db,sector.id).then(data=>({data,error:null})).catch(()=>({data:null,error:"unavailable"})),
    db.from("contacts").select("id",{count:"exact",head:true}).eq("sector_id",sector.id),
    db.from("conversations").select("id",{count:"exact",head:true}).eq("sector_id",sector.id),
    db.from("whatsapp_outbox").select("id",{count:"exact",head:true}).eq("sector_id",sector.id).in("status",["pending","sending"]),
    db.from("whatsapp_outbox").select("id",{count:"exact",head:true}).eq("sector_id",sector.id).eq("status","outcome_unknown"),
  ]);
  const stats = [["Contactos",contacts],["Conversaciones",conversations],["En cola",queued],["Por reconciliar",unknown]] as const;
  return <main className="min-h-dvh bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="bg-slate-950 p-6 text-white lg:min-h-dvh"><Link href="/dashboard" className="text-2xl font-black tracking-tight">WIS<span className="text-emerald-400"> / </span>WhatsApp</Link><p className="mt-2 text-xs text-slate-400">CONTROL DE CONEXIONES</p>
      <nav aria-label="Panel" className="mt-8 flex flex-wrap gap-2 lg:flex-col">{[["/dashboard","Vista general"],["/","Conversaciones"],["/dashboard#contactos","Contactos"],["/dashboard#operaciones","Operaciones"],["/dashboard#integraciones","Integraciones"],["/dashboard#capacidades","Catálogo de funciones"],...(profile.role === "admin" ? [["/settings/whatsapp","Conectar línea / QR"],["/settings/users","Usuarios"]] : [])].map(([href,label])=><Link className="rounded-xl px-3 py-3 text-sm hover:bg-slate-800" key={label} href={href}>{label}</Link>)}</nav>
      <form action={signOut} className="mt-8"><button className="text-sm text-slate-300">Cerrar sesión</button></form>
    </aside>
    <div className="mx-auto w-full max-w-7xl space-y-8 p-5 md:p-10"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-slate-500">Espacio local / {sector.display_name}</p><h1 className="mt-2 text-3xl font-bold">Centro de WhatsApp</h1><p className="mt-2 text-slate-500">Conversaciones, conexión e integraciones en un mismo lugar.</p></div><Link href="/settings/whatsapp" className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white">Administrar conexión</Link></header>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{sector.display_name}</p><h2 className="mt-2 text-xl font-semibold">{connection.error ? "Estado no disponible" : connection.data?.status === "connected" ? "Línea conectada" : "Vinculación pendiente"}</h2><p className="mt-2 text-sm text-slate-500">{connection.data?.phone ? `Identidad informada por WhatsApp: ${connection.data.phone}` : "Escaneá el QR desde Dispositivos vinculados de WhatsApp."}</p></div><span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs">Baileys · Sesión persistente</span></div></section>
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">{stats.map(([label,result])=><article key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold">{result.error ? "—" : result.count ?? 0}</p>{result.error && <p className="mt-1 text-xs text-amber-800">Lectura no disponible</p>}</article>)}</section>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Campañas desactivadas. Los envíos requieren consentimiento y habilitación explícita. Una integración no oficial no garantiza evitar suspensiones.</div>
      <DashboardTools admin={profile.role === "admin"} />
      {profile.role === "admin" && <Campaigns />}
    </div>
  </main>;
}
