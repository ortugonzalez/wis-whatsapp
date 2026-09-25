import { setActiveSectorAction } from "@/app/actions/sector-actions";
import { requireActiveProfile } from "@/lib/auth/require-member";
import {
  getActiveSectorIdFromCookie,
  listMembershipSectors,
} from "@/lib/sectors/active-sector";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SelectSectorPage() {
  const { profile } = await requireActiveProfile();
  const supabase = await createClient();
  const sectors = await listMembershipSectors(supabase, profile.id);

  if (sectors.length === 0) {
    redirect("/login?error=no_sector");
  }
  if (sectors.length === 1) {
    redirect(
      `/api/active-sector/bootstrap?sectorId=${encodeURIComponent(sectors[0].id)}`,
    );
  }

  const activeId = await getActiveSectorIdFromCookie();

  return (
    <main
      className="safe-pad-x mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6"
      style={{
        paddingTop: "max(2rem, var(--safe-top))",
        paddingBottom: "max(2rem, var(--safe-bottom))",
      }}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Choose a sector
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            You have access to multiple accounts. Choose which one to work with
            in this session.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {sectors.map((sector) => {
          const isActive = activeId === sector.id;
          return (
            <li key={sector.id}>
              <form action={setActiveSectorAction}>
                <input type="hidden" name="sectorId" value={sector.id} />
                <button
                  type="submit"
                  className={
                    isActive
                      ? "btn-solid min-h-11 w-full touch-manipulation px-4 py-3 text-left text-base"
                      : "btn min-h-11 w-full touch-manipulation px-4 py-3 text-left text-base"
                  }
                >
                  <span className="font-semibold">{sector.display_name}</span>
                  {isActive ? (
                    <span className="mt-0.5 block text-sm font-normal opacity-80">
                      Active
                    </span>
                  ) : null}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </main>
  );
}