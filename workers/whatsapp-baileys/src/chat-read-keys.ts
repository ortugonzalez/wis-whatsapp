/**
 * Baileys MD chatModify lastMessages:
 * reverse-chronological (newest first); the last element MUST be the last
 * message *received* in the chat (docs + chats.ts). Passing a fromMe last
 * message returns 200 and does nothing on the phone.
 *
 * readMessages needs inbound keys with the live chat JID (often @lid) and,
 * for LID 1:1, remoteJidAlt = PN so receipts address both layers (Baileys 7).
 */

export type ChatReadMessageKey = {
  remoteJid: string;
  remoteJidAlt?: string;
  fromMe: boolean;
  id: string;
  participant?: string;
};

export type ChatReadLastMessage = {
  key: ChatReadMessageKey;
  messageTimestamp: number;
};

export type ChatReadRow = {
  wa_message_id: string | null;
  direction: string;
  wa_sender_jid: string | null;
  created_at: string;
};

export function waTimestampSeconds(iso: string): number {
  const n = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isFinite(n) && n > 0 ? n : Math.floor(Date.now() / 1000);
}

export function isGroupChatJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

export function isLidChatJid(jid: string): boolean {
  return jid.endsWith("@lid");
}

export function buildMessageKey(input: {
  chatJid: string;
  pnJid: string | null;
  fromMe: boolean;
  id: string;
  senderJid: string | null;
}): ChatReadMessageKey {
  const key: ChatReadMessageKey = {
    remoteJid: input.chatJid,
    fromMe: input.fromMe,
    id: input.id,
  };
  if (
    input.pnJid &&
    isLidChatJid(input.chatJid) &&
    input.pnJid !== input.chatJid
  ) {
    key.remoteJidAlt = input.pnJid;
  }
  if (isGroupChatJid(input.chatJid) && !input.fromMe && input.senderJid) {
    key.participant = input.senderJid;
  }
  return key;
}

export function mapChatReadRows(
  rows: ChatReadRow[],
  chatJid: string,
  pnJid: string | null,
): ChatReadLastMessage[] {
  const out: ChatReadLastMessage[] = [];
  for (const r of rows) {
    const id = (r.wa_message_id ?? "").trim();
    if (!id) continue;
    out.push({
      key: buildMessageKey({
        chatJid,
        pnJid,
        fromMe: r.direction === "out",
        id,
        senderJid: r.wa_sender_jid,
      }),
      messageTimestamp: waTimestampSeconds(r.created_at),
    });
  }
  return out;
}

/**
 * Newest-first rows → lastMessages for chatModify.
 * Keep messages until (and including) the latest inbound.
 */
export function lastMessagesForChatModify(
  newestFirst: ChatReadLastMessage[],
): ChatReadLastMessage[] {
  if (!newestFirst.length) return [];
  const range: ChatReadLastMessage[] = [];
  for (const msg of newestFirst) {
    range.push(msg);
    if (!msg.key.fromMe) break;
  }
  if (!range.length) return [newestFirst[0]!];
  if (range.every((m) => m.key.fromMe)) {
    return [newestFirst[0]!];
  }
  return range;
}

export function unreadInboundKeys(
  newestFirst: ChatReadLastMessage[],
): ChatReadMessageKey[] {
  return newestFirst.filter((m) => !m.key.fromMe).map((m) => m.key);
}
