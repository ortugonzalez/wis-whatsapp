"use server";

import { redirect } from "next/navigation";
import { getRequestOrigin } from "@/lib/auth/origin";
import { clearActiveSectorCookie } from "@/lib/sectors/active-sector";
import { createClient } from "@/lib/supabase/server";

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = await getRequestOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth");
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await clearActiveSectorCookie();
  await supabase.auth.signOut();
  redirect("/login");
}
