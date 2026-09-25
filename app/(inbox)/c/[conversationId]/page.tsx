import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignDrainingBanner } from "@/app/components/inbox/campaign-draining-banner";
import { ChannelBanner } from "@/app/components/inbox/channel-banner";
import { InboxWithLabelFilter } from "@/app/components/inbox/inbox-with-label-filter";
import {
  ConversationLabelEditor,
  type LabelChip,
} from "@/app/components/inbox/label-chips";
import { ContactAvatar } from "@/app/components/inbox/contact-avatar";
import { InboxHeader } from "@/app/components/inbox/inbox-header";
import { OverflowReveal } from "@/app/components/inbox/overflow-reveal";
import { ThreadWithComposer } from "@/app/components/inbox/thread-with-composer";
import type { ThreadMessage } from "@/app/components/inbox/thread-view";
import { signedAvatarUrls } from "@/lib/contacts/avatar-url";
import { computeDisplayName } from "@/lib/contacts/display-name";
import { isCampaignDrainingForSector } from "@/lib/inbox/campaign-draining";
import {
  CONVERSATION_LIST_SELECT,
  lastMessageMetaFromEmbed,
} from "@/lib/inbox/last-message-meta";
import { formatProfileDisplayName, teamReadFromConversationRow, unreadCountMapFromRpc, badgeCountForChat, isWaUnreadLabelName } from "@/lib/inbox/team-read";
import { listMembershipSectors } from "@/lib/sectors/active-sector";
import { fetchConnectionBySectorId } from "@/lib/sectors/connection";
import { outboundOriginAuthorLabel } from "@/lib/kapso/outbound-origin";
import { isWithinKapsoServiceWindow } from "@/lib/kapso/window-24h";
import { requireActiveSector } from "@/lib/sectors/require-active-sector";
import { createClient } from "@/lib/supabase/server";
import type {
  DeliveryStatus,
  MessageDirection,
  MessageType,
  OutboundOrigin,
  WhatsappConnectionStatus,
} from "@/lib/supabase/types";

type PageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ConversationPage({ params }: PageProps) {
  const { conversationId } = await params;
  const { profile, sector } = await requireActiveSector();
  const supabase = await createClient();
  const memberships = await listMembershipSectors(supabase, profile.id);

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, kind, title, last_message_at, last_message_preview, team_read_at, team_read_by, team_read_via, contacts(display_name, agenda_name, verified_name, push_name, phone_e164, avatar_path)",
    )
    .eq("id", conversationId)
    .eq("sector_id", sector.id)
    .maybeSingle();

  if (!conversation) notFound();

  const isGroup = (conversation.kind as string) === "group";
  const contact = Array.isArray(conversation.contacts)
    ? conversation.contacts[0]
    : conversation.contacts;
  const ct = contact as {
    display_name?: string;
    agenda_name?: string;
    verified_name?: string;
    push_name?: string;
    phone_e164?: string | null;
    avatar_path?: string | null;
  } | null;
  const contactName = isGroup
    ? ((conversation.title as string | null)?.trim() || "Grupo")
    : computeDisplayName({
        agenda_name: ct?.agenda_name,
        verified_name: ct?.verified_name,
        push_name: ct?.push_name ?? ct?.display_name,
        phone_e164: ct?.phone_e164,
      });

  const [
    { data: messages },
    { data: conversations },
    connection,
    { data: labels },
    { data: assigned },
    { data: links },
    { data: unreadRows },
    { data: readerProfile },
    campaignDraining,
  ] = await Promise.all([
    supabase
      .from("messages")
      .select(
        "id, wa_message_id, direction, type, body, media_bucket_path, delivery_status, created_at, deleted_at, sent_by, outbound_origin, wa_sender_jid, wa_sender_name, quoted_message_id, quoted_wa_message_id, quoted_body_preview, profiles:sent_by(first_name, last_name, slug)",
      )
      .eq("conversation_id", conversationId)
      .eq("sector_id", sector.id)
      .order("created_at", { ascending: true })
      .limit(200),
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
    supabase
      .from("conversation_labels")
      .select("label_id")
      .eq("conversation_id", conversationId),
    supabase.from("conversation_labels").select("conversation_id, label_id"),
    supabase.rpc("crm_inbox_unread_counts", { p_sector_id: sector.id }),
    conversation.team_read_by
      ? supabase
          .from("profiles")
          .select("first_name, last_name, slug")
          .eq("id", conversation.team_read_by as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isCampaignDrainingForSector(supabase, sector.id),
  ]);

  const unreadByConv = unreadCountMapFromRpc(
    unreadRows as { conversation_id?: string; unread_count?: number }[] | null,
  );

  const thread: ThreadMessage[] = (messages ?? []).map((m) => {
    const author = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    let author_label: string | null = null;
    if (m.direction === "out") {
      const profileName =
        [author?.first_name, author?.last_name].filter(Boolean).join(" ") ||
        author?.slug ||
        null;
      if (profileName) {
        author_label = profileName;
      } else {
        author_label = outboundOriginAuthorLabel(
          m.outbound_origin as OutboundOrigin | null,
        );
      }
    } else if (isGroup) {
      author_label =
        (m.wa_sender_name as string | null)?.trim() ||
        (m.wa_sender_jid as string | null)?.split("@")[0] ||
        "Participante";
    }
    return {
      id: m.id as string,
      wa_message_id: (m.wa_message_id as string | null) ?? null,
      direction: m.direction as MessageDirection,
      type: m.type as MessageType,
      body: m.body as string | null,
      media_bucket_path: m.media_bucket_path as string | null,
      delivery_status: m.delivery_status as DeliveryStatus,
      created_at: m.created_at as string,
      deleted_at: (m.deleted_at as string | null) ?? null,
      author_label,
      quoted_message_id: (m.quoted_message_id as string | null) ?? null,
      quoted_wa_message_id: (m.quoted_wa_message_id as string | null) ?? null,
      quoted_body_preview: (m.quoted_body_preview as string | null) ?? null,
    };
  });

  const avatarMap = await signedAvatarUrls(
    supabase,
    [
      ct?.avatar_path,
      ...(conversations ?? []).map((c) => {
        const row = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
        return (row as { avatar_path?: string | null } | null)?.avatar_path;
      }),
    ],
  );

  const byConv = new Map<string, string[]>();
  for (const link of links ?? []) {
    const cid = link.conversation_id as string;
    const lid = link.label_id as string;
    const arr = byConv.get(cid) ?? [];
    arr.push(lid);
    byConv.set(cid, arr);
  }

  const unreadLabelId =
    (labels ?? []).find((l) => isWaUnreadLabelName(l.name as string))?.id ??
    null;

  const list = (conversations ?? []).map((c) => {
    const row = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
    const rowCt = row as {
      display_name?: string;
      agenda_name?: string;
      verified_name?: string;
      push_name?: string;
      phone_e164?: string | null;
      avatar_path?: string | null;
    } | null;
    const path = rowCt?.avatar_path ?? null;
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
      contact_name: computeDisplayName({
        agenda_name: rowCt?.agenda_name,
        verified_name: rowCt?.verified_name,
        push_name: rowCt?.push_name ?? rowCt?.display_name,
        phone_e164: rowCt?.phone_e164,
      }),
      phone_e164: rowCt?.phone_e164 ?? null,
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
  });

  const headerAvatarUrl = ct?.avatar_path
    ? (avatarMap.get(ct.avatar_path) ?? null)
    : null;

  const conversationTeam = teamReadFromConversationRow(conversation);
  const teamReadByName = formatProfileDisplayName(readerProfile);

  const labelChips: LabelChip[] = (labels ?? []).map((l) => ({
    id: l.id as string,
    wa_label_id: l.wa_label_id as string,
    name: l.name as string,
    color: (l.color as string | null) ?? null,
  }));

  const assignedIds = (assigned ?? []).map((a) => a.label_id as string);
  const hasWaUnread =
    unreadLabelId != null && assignedIds.includes(unreadLabelId);
  const status = (connection?.status ?? null) as WhatsappConnectionStatus | null;
  const connected = status === "connected";
  const writeEnabled = connection?.labels_write_enabled !== false;

  let initialKapsoWindowOpen: boolean | null = null;
  if (sector.channel_provider === "kapso") {
    const win = await isWithinKapsoServiceWindow(supabase, {
      sectorId: sector.id,
      conversationId,
    });
    initialKapsoWindowOpen = win.ok ? win.open : false;
  }

  return (
    <>
      <InboxHeader
        profile={profile}
        channelStatus={status}
        sector={sector}
        memberships={memberships}
      />
      <main className="safe-pad-x mx-auto grid min-h-0 w-full max-w-6xl flex-1 basis-0 grid-rows-[minmax(0,1fr)] gap-3 overflow-clip py-3 sm:gap-4 sm:py-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 min-w-0 flex-col overflow-clip lg:flex">
          <InboxWithLabelFilter
            initial={list}
            labels={labelChips}
            activeSectorId={sector.id}
            activeId={conversationId}
            channelConnected={connected}
            channelProvider={sector.channel_provider}
          />
        </aside>
        <section className="flex min-h-0 min-w-0 flex-col overflow-clip">
          <div className="shrink-0 pb-1">
            <CampaignDrainingBanner
              sectorId={sector.id}
              initialDraining={campaignDraining}
            />
            <ChannelBanner
              status={status}
              lastError={connection?.last_error ?? null}
              channelProvider={sector.channel_provider}
            />
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-[var(--color-teal)] touch-manipulation active:bg-[color-mix(in_srgb,var(--color-teal)_12%,transparent)] lg:hidden"
              >
                ← Lista
              </Link>
              <ContactAvatar
                name={contactName}
                avatarUrl={isGroup ? null : headerAvatarUrl}
                size="md"
              />
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <OverflowReveal
                  as="h1"
                  text={contactName}
                  className="min-w-0 truncate font-heading text-lg font-bold leading-tight"
                />
                <OverflowReveal
                  as="p"
                  text={isGroup ? "Grupo" : ct?.phone_e164 || "Sin E.164"}
                  className="min-w-0 shrink truncate text-[11px] text-[var(--text-muted)]"
                />
              </div>
              <ConversationLabelEditor
                conversationId={conversationId}
                allLabels={labelChips}
                assignedIds={assignedIds}
                writeEnabled={writeEnabled}
              />
            </div>
          </div>
          <ThreadWithComposer
            key={conversationId}
            conversationId={conversationId}
            channelConnected={connected}
            initialKapsoWindowOpen={initialKapsoWindowOpen}
            initial={thread}
            initiallyUnread={hasWaUnread}
            initialTeamReadAt={conversationTeam.team_read_at}
            initialTeamReadByName={teamReadByName}
            initialTeamReadVia={conversationTeam.team_read_via}
            forwardTargets={list.map((c) => ({
              id: c.id,
              contact_name: c.contact_name,
              kind: c.kind,
              title: c.title,
            }))}
          />
        </section>
      </main>
    </>
  );
}
