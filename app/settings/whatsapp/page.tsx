import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { requireAdmin } from "@/lib/whatsapp/admin";
import { WhatsappSettingsClient } from "./whatsapp-settings-client";
export default async function WhatsappSettingsPage() {
  if (!await requireAdmin()) redirect("/dashboard");
  const {sector}=await requireActiveSector();
  return <main className="min-h-dvh bg-slate-50 p-6"><div className="mx-auto max-w-2xl space-y-6"><Link href="/dashboard" className="text-sm text-emerald-700">← Volver al panel</Link><header><p className="text-sm font-bold text-emerald-700">WIS / CONEXIONES</p><h1 className="mt-2 text-3xl font-bold">Vincular WhatsApp</h1><p className="mt-3 text-slate-500">El worker local conserva la sesión. Escaneá únicamente con la línea prevista y revisá la identidad completa al conectar.</p></header><WhatsappSettingsClient sectorDisplayName={sector.display_name}/></div></main>;
}
