import { contactInitials } from "@/lib/contacts/display-name";

type Props = {
  name: string;
  /** Private storage path; signed URL resolved by parent when available. */
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md";
};

export function ContactAvatar({ name, avatarUrl, size = "sm" }: Props) {
  const dim =
    size === "md"
      ? "h-10 w-10 text-sm"
      : size === "xs"
        ? "h-8 w-8 text-[10px]"
        : "h-9 w-9 text-xs";
  const initials = contactInitials(name);

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, short-lived
      <img
        src={avatarUrl}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-teal)_18%,white)] font-heading font-bold text-[var(--color-teal)]`}
    >
      {initials}
    </span>
  );
}
