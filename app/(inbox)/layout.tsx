import { InboxShell } from "@/app/components/inbox/inbox-shell";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <InboxShell>{children}</InboxShell>;
}
