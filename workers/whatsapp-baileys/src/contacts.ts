import {
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  type Contact,
  type WASocket,
} from "baileys";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyBaileysContactFields } from "./db.js";

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

function phoneFromPnJid(jid: string): string | null {
  const user = jidNormalizedUser(jid).split("@")[0];
  if (!user || !/^\d+$/.test(user)) return null;
  return `+${user}`;
}

function identitiesFromContact(c: Contact): {
  waJid: string | null;
  waLid: string | null;
  phoneE164: string | null;
} {
  const id = c.id ? jidNormalizedUser(c.id) : "";
  let waJid: string | null = null;
  let waLid: string | null = null;
  let phoneE164: string | null = null;

  if (id && isLidUser(id)) waLid = id;
  else if (id && isPnUser(id)) {
    waJid = id;
    phoneE164 = phoneFromPnJid(id);
  }

  if (c.lid) {
    const lid = jidNormalizedUser(c.lid);
    if (isLidUser(lid)) waLid = lid;
  }
  if (c.phoneNumber) {
    const pn = jidNormalizedUser(c.phoneNumber);
    if (isPnUser(pn)) {
      waJid = pn;
      phoneE164 = phoneFromPnJid(pn);
    } else if (/^\+?\d+$/.test(c.phoneNumber.replace(/\s/g, ""))) {
      phoneE164 = c.phoneNumber.startsWith("+")
        ? c.phoneNumber
        : `+${c.phoneNumber.replace(/\D/g, "")}`;
    }
  }

  return { waJid, waLid, phoneE164 };
}

async function maybeFetchAvatar(
  sock: WASocket,
  supabase: SupabaseClient,
  contactId: string,
  jidForPic: string | null,
  imgUrl: string | null | undefined,
): Promise<string | null> {
  if (!jidForPic) return null;
  // null/undefined = no change signal; 'changed' or a URL → refresh.
  if (imgUrl == null) return null;

  try {
    const url = await sock.profilePictureUrl(jidForPic, "preview").catch(() => null);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const path = `avatars/${contactId}.jpg`;
    const { error } = await supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .upload(path, buf, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (error) {
      console.error("avatar_upload_error", error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error("avatar_fetch_error", err);
    return null;
  }
}

function countNamed(contacts: Contact[]) {
  let withAgenda = 0;
  let withPush = 0;
  for (const c of contacts) {
    if (c.name?.trim()) withAgenda += 1;
    if (c.notify?.trim()) withPush += 1;
  }
  return { withAgenda, withPush };
}

export async function handleContactsUpsert(
  sock: WASocket,
  supabase: SupabaseClient,
  contacts: Contact[],
  source: "upsert" | "history" = "upsert",
): Promise<void> {
  if (contacts.length > 0) {
    const stats = countNamed(contacts);
    console.log(
      JSON.stringify({
        event: "contacts_sync_batch",
        source,
        total: contacts.length,
        with_agenda_name: stats.withAgenda,
        with_push_name: stats.withPush,
      }),
    );
  }

  for (const c of contacts) {
    const ids = identitiesFromContact(c);
    if (!ids.waJid && !ids.waLid && !ids.phoneE164) continue;

    // Omit empty strings on upsert so MD "no name" does not wipe agenda/push/verified.
    const contactId = await applyBaileysContactFields(supabase, {
      ...ids,
      agendaName: c.name?.trim() || undefined,
      pushName: c.notify?.trim() || undefined,
      verifiedName: c.verifiedName?.trim() || undefined,
    });
    if (!contactId) continue;

    const jidForPic = ids.waJid ?? ids.waLid;
    const avatarPath = await maybeFetchAvatar(
      sock,
      supabase,
      contactId,
      jidForPic,
      c.imgUrl,
    );
    if (avatarPath) {
      await applyBaileysContactFields(supabase, {
        ...ids,
        avatarPath,
      });
    }
  }
}

export async function handleContactsUpdate(
  sock: WASocket,
  supabase: SupabaseClient,
  updates: Partial<Contact>[],
): Promise<void> {
  for (const u of updates) {
    if (!u.id && !u.lid && !u.phoneNumber) continue;
    const ids = identitiesFromContact(u as Contact);
    if (!ids.waJid && !ids.waLid && !ids.phoneE164) continue;

    const contactId = await applyBaileysContactFields(supabase, {
      ...ids,
      agendaName: u.name !== undefined ? (u.name ?? "") : undefined,
      pushName: u.notify !== undefined ? (u.notify ?? "") : undefined,
      verifiedName:
        u.verifiedName !== undefined ? (u.verifiedName ?? "") : undefined,
    });
    if (!contactId) continue;

    if (u.imgUrl !== undefined) {
      const jidForPic = ids.waJid ?? ids.waLid;
      const avatarPath = await maybeFetchAvatar(
        sock,
        supabase,
        contactId,
        jidForPic,
        u.imgUrl,
      );
      if (avatarPath) {
        await applyBaileysContactFields(supabase, {
          ...ids,
          avatarPath,
        });
      } else if (u.imgUrl === null) {
        await applyBaileysContactFields(supabase, {
          ...ids,
          avatarPath: null,
        });
      }
    }
  }
}
