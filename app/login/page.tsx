import { signInWithPassword } from "./actions";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const messages: Record<string, string> = { credentials: "No se pudo iniciar sesión. Revisá tu correo y contraseña.", unauthorized: "Tu usuario no está autorizado. Contactá al administrador.", no_sector: "Tu usuario no tiene una conexión asignada." };
  return <main className="flex min-h-dvh items-center justify-center bg-slate-950 p-6"><section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
    <div className="mb-8"><p className="mb-3 text-sm font-bold tracking-widest text-emerald-700">WIS / WHATSAPP</p><h1 className="text-3xl font-bold text-slate-900">Tu espacio de conexión.</h1><p className="mt-3 text-slate-600">Ingresá al panel local con tu usuario autorizado.</p></div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{messages[error] ?? "No se pudo completar el acceso."}</p>}
    <form action={signInWithPassword} className="space-y-5"><label className="block text-sm font-medium">Correo<input name="email" type="email" autoComplete="username" required maxLength={254} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><label className="block text-sm font-medium">Contraseña<input name="password" type="password" autoComplete="current-password" required maxLength={1024} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><button className="w-full rounded-xl bg-emerald-700 p-3 font-semibold text-white">Ingresar al panel</button></form>
    <p className="mt-6 text-xs text-slate-500">Acceso privado · Sesiones administradas desde el servidor local.</p>
  </section></main>;
}
