import Link from "next/link";
import { getSetupState } from "./health";

export const dynamic = "force-dynamic";
export default async function SetupPage() {
  const state = await getSetupState();
  const ready = state === "local_ready";
  const messages = {
    missing_configuration: "Falta la configuración local de Supabase. El panel todavía no puede iniciar una sesión.",
    local_unavailable: "Los servicios locales de Supabase no responden correctamente. No se pudo verificar autenticación y acceso a la base de datos.",
    local_ready: "Supabase local responde. Ya podés continuar al inicio de sesión.",
    remote_configured: "Hay una configuración externa. Esta pantalla solo diagnostica servicios locales y no comprobó ese servidor.",
  };
  return <main className="flex min-h-dvh items-center justify-center bg-slate-950 p-6"><section className="w-full max-w-2xl space-y-6 rounded-3xl bg-white p-8 shadow-xl">
    <header><p className="text-sm font-bold tracking-widest text-emerald-700">WIS / WHATSAPP</p><h1 className="mt-3 text-3xl font-bold">Preparar el entorno local</h1></header>
    <p role="status" className={`rounded-xl p-4 text-sm ${ready ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{messages[state]}</p>
    {!ready && <><p className="text-sm text-slate-600">Abrí Docker Desktop y esperá a que el motor esté disponible. Después, desde la carpeta del proyecto:</p><ol className="list-decimal space-y-3 pl-5 text-sm"><li>Iniciá Supabase: <code className="rounded bg-slate-100 px-2 py-1">npm run local:db</code></li><li>Prepará configuración y administrador: <code className="rounded bg-slate-100 px-2 py-1">npm run local:setup</code></li><li>Reiniciá el panel: <code className="rounded bg-slate-100 px-2 py-1">npm run dev</code></li><li>En otra terminal, iniciá el worker: <code className="rounded bg-slate-100 px-2 py-1">npm run worker</code></li></ol><p className="text-sm text-slate-500">Si Docker falla, resolvé su arranque antes de repetir la instalación. El QR requiere Supabase y el worker disponibles.</p></>}
    <div className="flex flex-wrap gap-3"><a href="/setup" className="rounded-xl border border-slate-300 px-4 py-3 text-sm">Volver a comprobar</a><Link href="/login" className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white">Ir al inicio de sesión</Link></div>
    <p className="border-t pt-4 text-xs text-slate-500">Este diagnóstico no vincula WhatsApp, no envía mensajes y no muestra credenciales.</p>
  </section></main>;
}
