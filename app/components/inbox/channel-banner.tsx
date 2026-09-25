import type { ChannelProvider } from "@/lib/sectors/connection";
import type { WhatsappConnectionStatus } from "@/lib/supabase/types";

type Props = {
  status: WhatsappConnectionStatus | null;
  lastError: string | null;
  channelProvider?: ChannelProvider;
};

export function ChannelBanner({
  status,
  lastError,
  channelProvider = "baileys",
}: Props) {
  if (status === "connected") return null;

  const isKapso = channelProvider === "kapso";

  const title = isKapso
    ? status === "disconnected" || !status
      ? "Canal Kapso desconectado"
      : `Canal Kapso: ${status}`
    : status === "qr_pending"
      ? "WhatsApp esperando QR"
      : status === "disconnected" || !status
        ? "Canal WhatsApp desconectado"
        : `Canal: ${status}`;

  const body = isKapso
    ? "Actualizá el estado en Configurar canal (Kapso / Cloud API). No hay QR ni worker en la VM."
    : "El worker en la VM debe estar en marcha y un admin debe vincular el número en Configurar canal. Los mensajes entrantes y salientes dependen de esa sesión.";

  return (
    <div
      className="rounded-xl border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_14%,white)] px-4 py-3 text-sm"
      role="status"
    >
      <p className="font-heading font-semibold text-[var(--text-primary)]">
        {title}
      </p>
      <p className="mt-1 text-[var(--text-secondary)]">{body}</p>
      {lastError ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Último error: {lastError}
        </p>
      ) : null}
    </div>
  );
}
