import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WAMessageKey,
  type WASocket,
} from "baileys";
import { Boom } from "@hapi/boom";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import pino from "pino";
import type { SupabaseClient } from "@supabase/supabase-js";
import { patchConnection } from "./db.js";
import { handleInboundMessages } from "./inbound.js";
import { handleMessageDeletes, handleMessageUpdates, handleMessageReceiptUpdates } from "./outbox.js";
import {
  handleLabelsAssociation,
  handleLabelsEdit,
  syncNativeChatUnread,
} from "./labels.js";
import {
  handleContactsUpdate,
  handleContactsUpsert,
} from "./contacts.js";

export type MessageCache = Map<string, unknown>;

export type SocketHandles = {
  sock: WASocket | null;
  messageCache: MessageCache;
  starting: boolean;
};

const logLevel = process.env.BAILEYS_LOG_LEVEL || "silent";

/** Incomplete history chunks: 0 is untrusted until isLatest, then replay. */
const historyUnreadByChat = new Map<string, number | null>();
const historyUnreadInflight: Promise<unknown>[] = [];
let historyUnreadEpoch = 0;

function pushHistoryUnreadChat(chat: {
  id?: string | null;
  unreadCount?: number | null;
}) {
  const chatId = chat.id;
  if (!chatId || chat.unreadCount === undefined) return;
  historyUnreadByChat.set(chatId, chat.unreadCount);
}

function drainHistoryUnreadBuffer(): {
  chatId: string;
  unreadCount: number | null;
}[] {
  const rows = [...historyUnreadByChat.entries()].map(([chatId, unreadCount]) => ({
    chatId,
    unreadCount,
  }));
  historyUnreadByChat.clear();
  return rows;
}

function resetHistoryUnreadState() {
  historyUnreadEpoch += 1;
  historyUnreadByChat.clear();
  historyUnreadInflight.length = 0;
}

function authDir(): string {
  const dir = process.env.WHATSAPP_AUTH_DIR;
  if (!dir) throw new Error("Missing WHATSAPP_AUTH_DIR");
  return dir;
}

export function ensureAuthDir() {
  mkdirSync(authDir(), { recursive: true });
}

export function wipeAuthDir() {
  const dir = authDir();
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
}

export async function startSocket(
  supabase: SupabaseClient,
  handles: SocketHandles,
  opts: { forceQr: boolean },
): Promise<void> {
  // Guard tick + soft-reconnect setTimeout from opening two sockets.
  if (handles.starting || handles.sock) return;
  handles.starting = true;

  try {
    if (opts.forceQr) {
      wipeAuthDir();
    }
    ensureAuthDir();

    const { state, saveCreds } = await useMultiFileAuthState(authDir());
    const logger = pino({ level: logLevel });

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      // Hermes hard rule: do NOT call fetchLatestBaileysVersion() for the socket.
      getMessage: async (key: WAMessageKey) => {
        const id = key.id;
        if (!id) return undefined;
        const hit = handles.messageCache.get(id);
        console.log(
          JSON.stringify({
            event: "getMessage",
            id,
            hit: Boolean(hit),
          }),
        );
        // Store real protobuf from sendMessage — never reconstruct { conversation }.
        return (hit ?? undefined) as
          | import("baileys").proto.IMessage
          | undefined;
      },
    });

    handles.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      // notify = inbound live; append = own sends (forward, device) — not history backfill.
      if (type === "notify") {
        void handleInboundMessages(sock, supabase, messages);
        return;
      }
      if (type === "append") {
        const own = messages.filter((m) => m.key.fromMe);
        if (own.length) void handleInboundMessages(sock, supabase, own);
      }
    });

    sock.ev.on("messages.update", (updates) => {
      void handleMessageUpdates(supabase, updates);
    });

    sock.ev.on("messages.delete", (item) => {
      void handleMessageDeletes(supabase, item);
    });

    sock.ev.on("message-receipt.update", (updates) => {
      void handleMessageReceiptUpdates(supabase, updates);
    });

    sock.ev.on("labels.edit", (label) => {
      void handleLabelsEdit(supabase, label).catch((err) => {
        console.error("labels_edit_error", err);
      });
    });

    sock.ev.on("labels.association", (payload) => {
      void handleLabelsAssociation(supabase, payload).catch((err) => {
        console.error("labels_association_error", err);
      });
    });

    // Phone inbox unread (bold/count) — not the same as labels.association.
    sock.ev.on("chats.update", (updates) => {
      for (const chat of updates) {
        const chatId = chat.id;
        const unreadCount = chat.unreadCount;
        if (!chatId || unreadCount === undefined) continue;
        void syncNativeChatUnread(supabase, {
          chatId,
          unreadCount,
          source: "chats.update",
          trustReadZero: true,
        }).catch((err) => {
          console.error("chats_update_unread_sync_error", err);
        });
      }
    });

    // Backfill / bulk snapshot when WA pushes the chat list (link or reconnect).
    sock.ev.on("chats.upsert", (chats) => {
      let synced = 0;
      for (const chat of chats) {
        const chatId = chat.id;
        const unreadCount = chat.unreadCount;
        if (!chatId || unreadCount === undefined) continue;
        synced += 1;
        void syncNativeChatUnread(supabase, {
          chatId,
          unreadCount,
          source: "chats.upsert",
        }).catch((err) => {
          console.error("chats_upsert_unread_sync_error", err);
        });
      }
      if (synced) {
        console.log(
          JSON.stringify({
            event: "chats_upsert_unread_queued",
            count: synced,
          }),
        );
      }
    });

    sock.ev.on("contacts.upsert", (contacts) => {
      void handleContactsUpsert(sock, supabase, contacts).catch((err) => {
        console.error("contacts_upsert_error", err);
      });
    });

    sock.ev.on("contacts.update", (updates) => {
      void handleContactsUpdate(sock, supabase, updates).catch((err) => {
        console.error("contacts_update_error", err);
      });
    });

    // S9: agenda names often arrive here on link/reconnect, not only contacts.upsert.
    // Contacts only for history — plus unreadCount from chats (no message backfill).
    sock.ev.on("messaging-history.set", ({ contacts, chats, progress, isLatest }) => {
      if (contacts?.length) {
        void handleContactsUpsert(sock, supabase, contacts, "history").catch(
          (err) => {
            console.error("history_contacts_error", err);
          },
        );
        console.log(
          JSON.stringify({
            event: "history_contacts_queued",
            count: contacts.length,
            progress: progress ?? null,
            isLatest: isLatest ?? null,
          }),
        );
      }
      if (chats?.length) {
        let synced = 0;
        for (const chat of chats) {
          pushHistoryUnreadChat(chat);
          const chatId = chat.id;
          const unreadCount = chat.unreadCount;
          if (!chatId || unreadCount === undefined) continue;
          synced += 1;
          // Pre-isLatest: only >0 (0 is lying). Same-event isLatest skips this
          // so the drain below is the sole write for the final snapshot.
          if (isLatest) continue;
          historyUnreadInflight.push(
            syncNativeChatUnread(supabase, {
              chatId,
              unreadCount,
              source: "history",
              trustReadZero: false,
            }).catch((err) => {
              console.error("history_chat_unread_sync_error", err);
            }),
          );
        }
        if (synced) {
          console.log(
            JSON.stringify({
              event: "history_chats_unread_queued",
              count: synced,
              progress: progress ?? null,
              isLatest: isLatest ?? null,
            }),
          );
        }
      }
      if (isLatest) {
        const batch = drainHistoryUnreadBuffer();
        const pending = historyUnreadInflight.splice(0);
        const epoch = historyUnreadEpoch;
        void (async () => {
          await Promise.allSettled(pending);
          if (epoch !== historyUnreadEpoch) return;
          for (const row of batch) {
            try {
              await syncNativeChatUnread(supabase, {
                chatId: row.chatId,
                unreadCount: row.unreadCount,
                source: "history:latest",
                trustReadZero: true,
              });
            } catch (err) {
              console.error("history_chat_unread_reconcile_error", err);
            }
          }
        })();
        if (batch.length) {
          console.log(
            JSON.stringify({
              event: "history_chats_unread_reconcile",
              count: batch.length,
            }),
          );
        }
      }
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        await patchConnection(supabase, {
          status: "qr_pending",
          qr_payload: qr,
          last_error: null,
        });
      }

      if (connection === "open") {
        const phone =
          sock.user?.id?.split(":")[0] ?? sock.user?.id ?? null;
        await patchConnection(supabase, {
          status: "connected",
          qr_payload: null,
          phone,
          last_error: null,
        });
        console.log(
          JSON.stringify({ event: "connected", phone, authDir: authDir() }),
        );
        // After a DB purge, incremental resync skips labelEditAction (version
        // already current). Clear versions so WA returns a full snapshot.
        void (async () => {
          try {
            await state.keys.set({
              "app-state-sync-version": {
                regular: null,
                regular_high: null,
                regular_low: null,
                critical_unblock_low: null,
              },
            });
            await sock.resyncAppState(
              [
                "regular",
                "regular_high",
                "regular_low",
                "critical_unblock_low",
              ],
              true,
            );
            console.log(
              JSON.stringify({ event: "labels_app_state_resync", mode: "snapshot" }),
            );
          } catch (err) {
            console.error("labels_app_state_resync_failed", err);
          }
        })();
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output
          ?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        handles.sock = null;
        resetHistoryUnreadState();

        if (loggedOut) {
          wipeAuthDir();
          await patchConnection(supabase, {
            status: "disconnected",
            qr_payload: null,
            phone: null,
            last_error: "logged_out",
          });
          return;
        }

        // Soft reconnect: keep connected (or leave qr_pending if never opened).
        // Never flash qr_pending while multi-file auth is still valid.
        await patchConnection(supabase, {
          last_error: "Reconectando…",
        });
        setTimeout(() => {
          void startSocket(supabase, handles, { forceQr: false }).catch(
            (err) => {
              console.error("reconnect_failed", err);
            },
          );
        }, 3000);
      }
    });
  } finally {
    handles.starting = false;
  }
}

export async function stopSocketLogout(
  supabase: SupabaseClient,
  handles: SocketHandles,
) {
  const sock = handles.sock;
  handles.sock = null;
  try {
    if (sock) await sock.logout();
  } catch {
    // best effort
  }
  wipeAuthDir();
  await patchConnection(supabase, {
    status: "disconnected",
    qr_payload: null,
    phone: null,
    last_error: null,
  });
}
