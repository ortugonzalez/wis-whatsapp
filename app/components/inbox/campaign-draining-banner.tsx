"use client";

import { useEffect, useState } from "react";
import { fetchCampaignDraining } from "@/app/actions/campaign-draining";
import { CAMPAIGN_DRAINING_BANNER_COPY } from "@/lib/inbox/campaign-draining-copy";

export { CAMPAIGN_DRAINING_BANNER_COPY };

const POLL_MS = 30_000;

type Props = {
  sectorId: string;
  initialDraining: boolean;
};

/**
 * Banner no bloqueante (ADR 005 / S22). Composer sigue usable.
 * Fail-open: si el poll falla, se oculta.
 */
export function CampaignDrainingBanner({
  sectorId,
  initialDraining,
}: Props) {
  const [draining, setDraining] = useState(initialDraining);

  const [source, setSource] = useState({initialDraining, sectorId});
  if (source.initialDraining !== initialDraining || source.sectorId !== sectorId) {
    setSource({initialDraining, sectorId});
    setDraining(initialDraining);
  }

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await fetchCampaignDraining(sectorId);
        if (!cancelled) setDraining(next);
      } catch {
        if (!cancelled) setDraining(false);
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sectorId]);

  if (!draining) return null;

  return (
    <div
      className="mb-2 rounded-xl border border-[color-mix(in_srgb,var(--color-teal)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-teal)_10%,white)] px-4 py-2.5 text-sm text-[var(--text-primary)]"
      role="status"
    >
      <p className="font-heading font-semibold">{CAMPAIGN_DRAINING_BANNER_COPY}</p>
    </div>
  );
}
