import { CampaignDrainingBanner } from "@/app/components/inbox/campaign-draining-banner";
import { ChannelBanner } from "@/app/components/inbox/channel-banner";
import { InboxWithLabelFilter } from "@/app/components/inbox/inbox-with-label-filter";
import type { LabelChip } from "@/app/components/inbox/label-chips";
import { InboxHeader } from "@/app/components/inbox/inbox-header";
import { signedAvatarUrls } from "@/lib/contacts/avatar-url";
import { computeDisplayName } from "@/lib/contacts/display-name";
import { isCampaignDrainingForSector } from "@/lib/inbox/campaign-draining";
import {
  CONVERSATION_LIST_SELECT,
  lastMessageMetaFromEmbed,
} from "@/lib/inbox/last-message-meta";
import { dedupeDirectConversationsByPhone } from "@/lib/inbox/dedupe-conversations";
import {
  badgeCountForChat,
  isWaUnreadLabelName,
  unreadCountMapFromRpc,
} from "@/lib/inbox/team-read";
import { listMembershipSectors } from "@/lib/sectors/active-sector";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { createClient } from "@/lib/supabase/server";
import type { WhatsappConnectionStatus } from "@/lib/supabase/types";

export default async function InboxPage() {
  const { profile, sector } = await requireActiveSector();
  const supabase = await createClient();
  const memberships = await listMembershipSectors(supabase, profile.id);

  const [
    { data: conversations },
    connection,
    { data: labels },
    { data: links },
    { data: unreadRows },
    campaignDraining,
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select(CONVERSATION_LIST_SELECT)
      .eq("sector_id", sector.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, referencedTable: "messages" })
      .limit(1, { referencedTable: "messages" })
      .limit(80),
    fetchConnectionBySectorId(supabase, sector.id),
    supabase
      .from("labels")
      .select("id, wa_label_id, name, color")
      .eq("sector_id", sector.id)
      .order("name", { ascending: true }),
    supabase.from("conversation_labels").select("conversation_id, label_id"),
    supabase.rpc("crm_inbox_unread_counts", { p_sector_id: sector.id }),
    isCampaignDrainingForSector(supabase, sector.id),
  ]);

  const unreadByConv = unreadCountMapFromRpc(
    unreadRows as { conversation_id?: string; unread_count?: number }[] | null,
  );
  const unreadLabelId =
    (labels ?? []).find((l) => isWaUnreadLabelName(l.name as string))?.id ??
    null;

  const labelChips: LabelChip[] = (labels ?? []).map((l) => ({
    id: l.id as string,
    wa_label_id: l.wa_label_id as string,
    name: l.name as string,
    color: (l.color as string | null) ?? null,
  }));

  const byConv = new Map<string, string[]>();
  for (const link of links ?? []) {
    const cid = link.conversation_id as string;
    const lid = link.label_id as string;
    const arr = byConv.get(cid) ?? [];
    arr.push(lid);
    byConv.set(cid, arr);
  }

  const avatarMap = await signedAvatarUrls(
    supabase,
    (conversations ?? []).map((c) => {
      const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
      return (contact as { avatar_path?: string | null } | null)?.avatar_path;
    }),
  );

  const rows = dedupeDirectConversationsByPhone(
    (conversations ?? []).map((c) => {
    const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
    const ct = contact as {
      display_name?: string;
      agenda_name?: string;
      verified_name?: string;
      push_name?: string;
      phone_e164?: string | null;
      avatar_path?: string | null;
    } | null;
    const name = computeDisplayName({
      agenda_name: ct?.agenda_name,
      verified_name: ct?.verified_name,
      push_name: ct?.push_name ?? ct?.display_name,
      phone_e164: ct?.phone_e164,
    });
    const path = ct?.avatar_path ?? null;
    const meta = lastMessageMetaFromEmbed(c.messages);
    const kind = ((c.kind as string) === "group" ? "group" : "direct") as
      | "direct"
      | "group";
    const id = c.id as string;
    const labelIds = byConv.get(id) ?? [];
    const hasWaUnread =
      unreadLabelId != null && labelIds.includes(unreadLabelId);
    return {
      id,
      last_message_at: c.last_message_at as string | null,
      last_message_preview: c.last_message_preview as string | null,
      contact_name: name,
      phone_e164: ct?.phone_e164 ?? null,
      avatar_url: path ? (avatarMap.get(path) ?? null) : null,
      last_direction: meta.direction,
      last_delivery_status: meta.delivery_status,
      kind,
      title: (c.title as string | null) ?? null,
      unread_count: badgeCountForChat({
        hasWaUnreadLabel: hasWaUnread,
        cursorUnreadCount: unreadByConv.get(id) ?? 0,
      }),
      labelIds,
    };
  }),
  );

  const status = (connection?.status ?? null) as WhatsappConnectionStatus | null;

  return (
    <>
      <InboxHeader
        profile={profile}
        channelStatus={status}
        sector={sector}
        memberships={memberships}
      />
      <main className="safe-pad-x mx-auto grid min-h-0 w-full max-w-6xl flex-1 basis-0 grid-rows-[minmax(0,1fr)] gap-3 overflow-clip py-3 sm:gap-4 sm:py-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-0 min-w-0 flex-col overflow-clip">
          <InboxWithLabelFilter
            initial={rows}
            labels={labelChips}
            activeSectorId={sector.id}
            channelConnected={status === "connected"}
            channelProvider={sector.channel_provider}
          />
        </aside>
        <section
          className="hidden min-h-0 min-w-0 flex-col overflow-clip rounded-2xl border border-[color-mix(in_srgb,var(--color-gris)_12%,transparent)] bg-[var(--bg-surface)] px-6 py-10 lg:flex"
          aria-label="Conversación"
        >
          <div className="shrink-0">
            <CampaignDrainingBanner
              sectorId={sector.id}
              initialDraining={campaignDraining}
            />
            <ChannelBanner
              status={status}
              lastError={connection?.last_error ?? null}
              channelProvider={sector.channel_provider}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
            <p className="font-heading text-lg font-semibold text-[var(--text-primary)]">
              Elegí una conversación
            </p>
            <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
              Seleccioná un chat de la lista para ver el hilo y responder.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
