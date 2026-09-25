"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  createProfile,
  setProfileActive,
  updateProfile,
} from "@/app/actions/profile-actions";
import { OverflowReveal } from "@/app/components/inbox/overflow-reveal";
import type { SectorRow } from "@/lib/sectors/connection";
import type { Profile, ProfileRole } from "@/lib/supabase/types";

type Props = {
  initialProfiles: Profile[];
  sectors: SectorRow[];
  membershipsByProfileId: Record<string, string[]>;
  currentProfileId: string;
};

const inputClass =
  "w-full rounded-md border border-[color-mix(in_srgb,var(--color-gris)_25%,transparent)] bg-[var(--bg-surface)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none focus:border-[var(--color-naranja)]";

function sectorLabels(
  sectors: SectorRow[],
  sectorIds: string[] | undefined,
): string {
  if (!sectorIds?.length) return "sin sector";
  const byId = new Map(sectors.map((s) => [s.id, s.display_name]));
  return sectorIds
    .map((id) => byId.get(id) ?? id)
    .sort((a, b) => a.localeCompare(b, "es"))
    .join(" · ");
}

function readCheckedSectorIds(
  form: HTMLFormElement,
  sectors: SectorRow[],
): string[] {
  return sectors
    .filter((s) => {
      const el = form.elements.namedItem(`sector_${s.id}`);
      return el instanceof HTMLInputElement && el.checked;
    })
    .map((s) => s.id);
}

export function UsersSettingsClient({
  initialProfiles,
  sectors,
  membershipsByProfileId,
  currentProfileId,
}: Props) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  const contableId =
    sectors.find((s) => s.slug === "contable")?.id ?? sectors[0]?.id ?? "";

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<ProfileRole>("agent");
  const [slug, setSlug] = useState("");
  const [createSectorIds, setCreateSectorIds] = useState<string[]>(
    contableId ? [contableId] : [],
  );

  function onCreate(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setError(null);
      const res = await createProfile({
        email,
        firstName,
        lastName,
        role,
        slug: slug || undefined,
        sectorIds: createSectorIds,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEmail("");
      setFirstName("");
      setLastName("");
      setSlug("");
      setRole("agent");
      setCreateSectorIds(contableId ? [contableId] : []);
      window.location.reload();
    });
  }

  function onSaveEdit(p: Profile, form: HTMLFormElement) {
    const fd = new FormData(form);
    const sectorIds = readCheckedSectorIds(form, sectors);
    startTransition(async () => {
      setError(null);
      const res = await updateProfile({
        id: p.id,
        firstName: String(fd.get("first_name") ?? ""),
        lastName: String(fd.get("last_name") ?? ""),
        slug: String(fd.get("slug") ?? ""),
        role: (String(fd.get("role") ?? "agent") as ProfileRole) === "admin"
          ? "admin"
          : "agent",
        sectorIds,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditingId(null);
      window.location.reload();
    });
  }

  function onToggleActive(p: Profile) {
    startTransition(async () => {
      setError(null);
      const res = await setProfileActive({
        id: p.id,
        isActive: !p.is_active,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setProfiles((prev) =>
        prev.map((row) =>
          row.id === p.id ? { ...row, is_active: !p.is_active } : row,
        ),
      );
    });
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-md bg-[color-mix(in_srgb,var(--color-rojo)_12%,transparent)] px-3 py-2 text-sm text-[var(--color-rojo)]">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-bold text-[var(--text-primary)]">
          Alta
        </h2>
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs text-[var(--text-muted)]">Email Google</span>
            <input
              className={inputClass}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@acebal.gob.ar"
              autoComplete="off"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-muted)]">Nombre</span>
            <input
              className={inputClass}
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-muted)]">Apellido</span>
            <input
              className={inputClass}
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-muted)]">Slug (opcional)</span>
            <input
              className={inputClass}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="desde el email"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-muted)]">Rol</span>
            <select
              className={inputClass}
              value={role}
              onChange={(e) => setRole(e.target.value as ProfileRole)}
            >
              <option value="agent">agent</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-xs text-[var(--text-muted)]">Sectores</legend>
            <div className="flex flex-col gap-2">
              {sectors.map((s) => {
                const checked = createSectorIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-naranja)]"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCreateSectorIds((prev) => [...prev, s.id]);
                        } else {
                          setCreateSectorIds((prev) =>
                            prev.filter((id) => id !== s.id),
                          );
                        }
                      }}
                    />
                    <span>{s.display_name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="btn-institucional px-4 py-2 text-sm disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-bold text-[var(--text-primary)]">
          Allowlist
        </h2>
        <ul className="divide-y divide-[color-mix(in_srgb,var(--color-gris)_12%,transparent)] border-y border-[color-mix(in_srgb,var(--color-gris)_12%,transparent)]">
          {profiles.map((p) => (
            <li key={p.id} className="py-4">
              {editingId === p.id ? (
                <form
                  className="grid gap-2 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSaveEdit(p, e.currentTarget);
                  }}
                >
                  <input
                    name="first_name"
                    className={inputClass}
                    defaultValue={p.first_name}
                    required
                  />
                  <input
                    name="last_name"
                    className={inputClass}
                    defaultValue={p.last_name}
                    required
                  />
                  <input
                    name="slug"
                    className={inputClass}
                    defaultValue={p.slug}
                    required
                  />
                  <select
                    name="role"
                    className={inputClass}
                    defaultValue={p.role}
                  >
                    <option value="agent">agent</option>
                    <option value="admin">admin</option>
                  </select>
                  <fieldset className="space-y-2 sm:col-span-2">
                    <legend className="text-xs text-[var(--text-muted)]">
                      Sectores
                    </legend>
                    <div className="flex flex-col gap-2">
                      {sectors.map((s) => (
                        <label
                          key={s.id}
                          className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]"
                        >
                          <input
                            type="checkbox"
                            name={`sector_${s.id}`}
                            className="h-4 w-4 accent-[var(--color-naranja)]"
                            defaultChecked={(
                              membershipsByProfileId[p.id] ?? []
                            ).includes(s.id)}
                          />
                          <span>{s.display_name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex gap-2 sm:col-span-2">
                    <button
                      type="submit"
                      disabled={pending}
                      className="btn-institucional px-3 py-1.5 text-sm"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm text-[var(--text-muted)] underline-offset-2 hover:underline"
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-[var(--text-primary)]">
                      {p.first_name} {p.last_name}{" "}
                      <span className="text-xs font-normal text-[var(--text-muted)]">
                        @{p.slug}
                      </span>
                    </p>
                    <OverflowReveal
                      as="p"
                      text={p.email}
                      className="truncate text-sm text-[var(--text-secondary)]"
                    />
                    <p className="text-xs text-[var(--text-muted)]">
                      {p.role}
                      {p.is_active ? "" : " · inactivo"}
                      {p.user_id ? "" : " · sin vincular aún"}
                      {p.id === currentProfileId ? " · vos" : ""}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {sectorLabels(sectors, membershipsByProfileId[p.id])}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="btn-institucional px-3 py-1.5 text-sm"
                      disabled={pending}
                      onClick={() => setEditingId(p.id)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn-institucional px-3 py-1.5 text-sm"
                      disabled={pending || p.id === currentProfileId}
                      onClick={() => onToggleActive(p)}
                    >
                      {p.is_active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
