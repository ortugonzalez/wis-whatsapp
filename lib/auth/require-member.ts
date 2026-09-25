import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import { redirect } from "next/navigation";

export async function requireActiveProfile(): Promise<{
  profile: Profile;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, user_id, email, slug, first_name, last_name, role, is_active, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle<Profile>();

  if (!profile) {
    redirect("/login?error=unauthorized");
  }

  return { profile, userId: user.id };
}
