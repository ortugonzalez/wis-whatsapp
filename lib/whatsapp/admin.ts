import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

export type AdminContext = {
  profile: Profile;
};

/** Returns active admin profile or null (caller should 401/403). */
export async function requireAdmin(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, user_id, email, slug, first_name, last_name, role, is_active, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("role", "admin")
    .maybeSingle<Profile>();

  if (!profile) return null;
  return { profile };
}
