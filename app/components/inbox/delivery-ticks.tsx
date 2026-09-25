import type { DeliveryStatus } from "@/lib/supabase/types";

const LABELS: Record<DeliveryStatus, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "Falló",
};

export function DeliveryTicks({ status }: { status: DeliveryStatus }) {
  const tone =
    status === "failed"
      ? "text-[var(--danger)]"
      : status === "read"
        ? "text-[var(--color-teal)]"
        : "text-[var(--text-muted)]";

  const mark =
    status === "pending"
      ? "…"
      : status === "sent"
        ? "✓"
        : status === "delivered" || status === "read"
          ? "✓✓"
          : "!";

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] ${tone}`}
      title={LABELS[status]}
      aria-label={LABELS[status]}
    >
      <span aria-hidden>{mark}</span>
      <span className="sr-only">{LABELS[status]}</span>
    </span>
  );
}
