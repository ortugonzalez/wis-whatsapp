import Image from "next/image";
import { signInWithGoogle } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  let message: string | null = null;
  if (error === "unauthorized") {
    message =
      "Your Google account is not authorized. Ask the admin to add you to the allowlist.";
  } else if (error === "no_sector") {
    message =
      "Your user has no sector assigned. Ask the admin to add you to a sector.";
  } else if (error === "oauth") {
    message = "Could not start Google login. Try again.";
  } else if (error === "auth") {
    message = "Session exchange failed. Try again.";
  }

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
            WhatsApp CRM
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            Sign in with your authorized Google account.
          </p>
        </div>
      </div>

      {message ? (
        <p
          className="rounded-xl border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] px-3 py-2 text-sm text-[var(--color-danger)]"
          role="alert"
        >
          {message}
        </p>
      ) : null}

      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="btn-solid min-h-11 w-full px-4 py-3 text-base"
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}