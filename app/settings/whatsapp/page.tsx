import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { requireAdmin } from "@/lib/whatsapp/admin";
import { WhatsappSettingsClient } from "./whatsapp-settings-client";

export default async function WhatsappSettingsPage() {
  const admin = await requireAdmin();
  if (!admin) {
    redirect("/");
  }

  const { sector } = await requireActiveSector();
  const isKapso = sector.channel_provider === "kapso";

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 p-8">
      <div className="space-y-2">
        <p className="text-sm text-neutral-500">
          <Link href="/" className="underline-offset-2 hover:underline">
            ← Inicio
          </Link>
          {" · "}
          <Link
            href="/settings/users"
            className="underline-offset-2 hover:underline"
          >
            Usuarios
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Canal WhatsApp
        </h1>
        <p className="text-neutral-600">
          Operás la conexión del sector activo:{" "}
          <span className="font-medium text-neutral-900">
            {sector.display_name}
          </span>
          .
          {isKapso ? (
            <>
              {" "}
              Canal <strong>Kapso / Cloud API</strong> (sin QR ni VM Baileys).
              Actualizá el estado desde Meta vía Kapso.
            </>
          ) : (
            <>
              {" "}
              El socket Baileys vive en la VM GCP, no en Vercel. Acá solo pedís
              QR / desconexión y encolás un test.
            </>
          )}
        </p>
      </div>
      <WhatsappSettingsClient
        sectorDisplayName={sector.display_name}
        channelProvider={sector.channel_provider}
      />
    </main>
  );
}
