import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/whatsapp/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import type { SectorRow } from "@/lib/sectors/connection";
import { UsersSettingsClient } from "./users-settings-client";

export default async function UsersSettingsPage() {
  const admin = await requireAdmin();
  if (!admin) {
    redirect("/");
  }

  const supabase = await createClient();
  const [
    { data, error },
    { data: sectorsData, error: sectorsError },
    { data: membershipsData, error: membershipsError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, user_id, email, slug, first_name, last_name, role, is_active, created_at, updated_at",
      )
      .order("is_active", { ascending: false })
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase
      .from("sectors")
      .select("id, slug, display_name, channel_provider")
      .order("display_name", { ascending: true }),
    supabase.from("sector_memberships").select("profile_id, sector_id"),
  ]);

  if (error || sectorsError || membershipsError) {
    const message =
      error?.message ??
      sectorsError?.message ??
      membershipsError?.message ??
      "Error desconocido";
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-8">
        <p className="text-sm text-[var(--text-muted)]">
          <Link href="/" className="underline-offset-2 hover:underline">
            ← Inicio
          </Link>
        </p>
        <h1 className="font-heading text-2xl font-bold text-[var(--text-primary)]">
          Usuarios
        </h1>
        <p className="text-[var(--color-rojo)]">
          No se pudo cargar la lista: {message}
        </p>
      </main>
    );
  }

  const sectors = (sectorsData ?? []) as SectorRow[];
  const membershipsByProfileId: Record<string, string[]> = {};
  for (const row of membershipsData ?? []) {
    const list = membershipsByProfileId[row.profile_id] ?? [];
    list.push(row.sector_id);
    membershipsByProfileId[row.profile_id] = list;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-8">
      <div className="space-y-2">
        <p className="text-sm text-[var(--text-muted)]">
          <Link href="/" className="underline-offset-2 hover:underline">
            ← Inicio
          </Link>
          {" · "}
          <Link
            href="/settings/whatsapp"
            className="underline-offset-2 hover:underline"
          >
            Canal
          </Link>
        </p>
        <h1 className="font-heading text-2xl font-bold text-[var(--text-primary)]">
          Usuarios
        </h1>
        <p className="text-[var(--text-secondary)]">
          Allowlist Google: el agente solo entra si su email está acá y activo.
          Asigná sectores con los checkboxes (sin sector no ve bandeja).
        </p>
      </div>
      <UsersSettingsClient
        initialProfiles={(data ?? []) as Profile[]}
        sectors={sectors}
        membershipsByProfileId={membershipsByProfileId}
        currentProfileId={admin.profile.id}
      />
    </main>
  );
}
