"use server";

import { requireAdmin } from "@/lib/whatsapp/admin";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRole } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

export type ProfileActionResult =
  | { ok: true }
  | { ok: false; error: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function slugFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const slug = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "user";
}

function uniqueSectorIds(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
}

async function assertAdmin() {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false as const, error: "No autorizado." };
  }
  return { ok: true as const, admin };
}

/** Blocks removing the only active admin (deactivate or demote). */
async function assertNotLastActiveAdmin(
  profileId: string,
): Promise<ProfileActionResult | null> {
  const supabase = await createClient();
  const { data: target, error: targetErr } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", profileId)
    .maybeSingle();
  if (targetErr) return { ok: false, error: targetErr.message };
  if (!target) return { ok: false, error: "Usuario no encontrado." };
  if (target.role !== "admin" || !target.is_active) return null;

  const { count, error: countErr } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true);
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) <= 1) {
    return {
      ok: false,
      error: "Tiene que quedar al menos un admin activo.",
    };
  }
  return null;
}

/** Replace profile memberships with the given sector ids (at least one). */
async function syncSectorMemberships(
  supabase: SupabaseClient,
  profileId: string,
  sectorIds: string[],
): Promise<ProfileActionResult | null> {
  const ids = uniqueSectorIds(sectorIds);
  if (ids.length === 0) {
    return { ok: false, error: "Elegí al menos un sector." };
  }

  const { data: sectors, error: sectorsErr } = await supabase
    .from("sectors")
    .select("id")
    .in("id", ids);
  if (sectorsErr) return { ok: false, error: sectorsErr.message };
  if ((sectors ?? []).length !== ids.length) {
    return { ok: false, error: "Hay un sector inválido." };
  }

  const { data: existing, error: existingErr } = await supabase
    .from("sector_memberships")
    .select("id, sector_id")
    .eq("profile_id", profileId);
  if (existingErr) return { ok: false, error: existingErr.message };

  const current = new Set((existing ?? []).map((row) => row.sector_id));
  const desired = new Set(ids);

  // Insert before delete so a failed swap never leaves the profile with 0 sectors.
  const toAdd = ids.filter((id) => !current.has(id));
  if (toAdd.length > 0) {
    const { error: insErr } = await supabase.from("sector_memberships").insert(
      toAdd.map((sector_id) => ({ profile_id: profileId, sector_id })),
    );
    if (insErr) return { ok: false, error: insErr.message };
  }

  const toRemove = (existing ?? [])
    .filter((row) => !desired.has(row.sector_id))
    .map((row) => row.id);
  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from("sector_memberships")
      .delete()
      .in("id", toRemove);
    if (delErr) return { ok: false, error: delErr.message };
  }

  return null;
}

export async function createProfile(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: ProfileRole;
  slug?: string;
  sectorIds: string[];
}): Promise<ProfileActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const email = normalizeEmail(input.email);
  if (!email.includes("@")) {
    return { ok: false, error: "Email inválido." };
  }
  const role = input.role === "admin" ? "admin" : "agent";
  const slug = (input.slug?.trim() || slugFromEmail(email)).slice(0, 40);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) {
    return { ok: false, error: "Nombre y apellido son obligatorios." };
  }

  const sectorIds = uniqueSectorIds(input.sectorIds);
  if (sectorIds.length === 0) {
    return { ok: false, error: "Elegí al menos un sector." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      email,
      slug,
      first_name: firstName,
      last_name: lastName,
      role,
      is_active: true,
      user_id: null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ese email o slug ya existe." };
    }
    return { ok: false, error: error.message };
  }

  const membershipErr = await syncSectorMemberships(
    supabase,
    data.id,
    sectorIds,
  );
  if (membershipErr && !membershipErr.ok) {
    const { error: rollbackErr } = await supabase
      .from("profiles")
      .delete()
      .eq("id", data.id);
    if (rollbackErr) {
      return {
        ok: false,
        error: `${membershipErr.error} (no se pudo revertir el alta: ${rollbackErr.message})`,
      };
    }
    return membershipErr;
  }

  revalidatePath("/settings/users");
  return { ok: true };
}

export async function updateProfile(input: {
  id: string;
  firstName: string;
  lastName: string;
  role: ProfileRole;
  slug: string;
  sectorIds: string[];
}): Promise<ProfileActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const slug = input.slug.trim().slice(0, 40);
  const role = input.role === "admin" ? "admin" : "agent";
  if (!firstName || !lastName || !slug) {
    return { ok: false, error: "Completá nombre, apellido y slug." };
  }

  if (role === "agent") {
    const blocked = await assertNotLastActiveAdmin(input.id);
    if (blocked) return blocked;
  }

  const sectorIds = uniqueSectorIds(input.sectorIds);
  if (sectorIds.length === 0) {
    return { ok: false, error: "Elegí al menos un sector." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      role,
      slug,
    })
    .eq("id", input.id)
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ese slug ya está en uso." };
    }
    return { ok: false, error: error.message };
  }
  if (!data?.length) {
    return { ok: false, error: "Usuario no encontrado." };
  }

  const membershipErr = await syncSectorMemberships(
    supabase,
    input.id,
    sectorIds,
  );
  if (membershipErr) return membershipErr;

  revalidatePath("/settings/users");
  return { ok: true };
}

export async function setProfileActive(input: {
  id: string;
  isActive: boolean;
}): Promise<ProfileActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  if (!input.isActive && input.id === gate.admin.profile.id) {
    return { ok: false, error: "No podés desactivarte a vos mismo." };
  }

  if (!input.isActive) {
    const blocked = await assertNotLastActiveAdmin(input.id);
    if (blocked) return blocked;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: input.isActive })
    .eq("id", input.id)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "Usuario no encontrado." };
  }

  revalidatePath("/settings/users");
  return { ok: true };
}
