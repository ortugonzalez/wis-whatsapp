import assert from "node:assert/strict";
import {
  buildMessageKey,
  lastMessagesForChatModify,
  mapChatReadRows,
  unreadInboundKeys,
} from "./chat-read-keys.js";

const lid = "123@lid";
const pn = "5491111111111@s.whatsapp.net";

const inbound = buildMessageKey({
  chatJid: lid,
  pnJid: pn,
  fromMe: false,
  id: "IN1",
  senderJid: null,
});
assert.equal(inbound.remoteJid, lid);
assert.equal(inbound.remoteJidAlt, pn);
assert.equal(inbound.participant, undefined);

const groupIn = buildMessageKey({
  chatJid: "120@g.us",
  pnJid: null,
  fromMe: false,
  id: "G1",
  senderJid: "555@lid",
});
assert.equal(groupIn.participant, "555@lid");
assert.equal(groupIn.remoteJidAlt, undefined);

const newestFirst = mapChatReadRows(
  [
    {
      wa_message_id: "OUT2",
      direction: "out",
      wa_sender_jid: null,
      created_at: "2026-08-28T17:00:02.000Z",
    },
    {
      wa_message_id: "IN1",
      direction: "in",
      wa_sender_jid: null,
      created_at: "2026-08-28T17:00:01.000Z",
    },
    {
      wa_message_id: "IN0",
      direction: "in",
      wa_sender_jid: null,
      created_at: "2026-08-28T17:00:00.000Z",
    },
  ],
  lid,
  pn,
);

const range = lastMessagesForChatModify(newestFirst);
assert.equal(range.length, 2);
assert.equal(range[0]?.key.id, "OUT2");
assert.equal(range[1]?.key.id, "IN1");
assert.equal(range[1]?.key.fromMe, false);

const onlyInbound = lastMessagesForChatModify(newestFirst.slice(1));
assert.equal(onlyInbound.length, 1);
assert.equal(onlyInbound[0]?.key.id, "IN1");

const keys = unreadInboundKeys(newestFirst);
assert.deepEqual(
  keys.map((k) => k.id),
  ["IN1", "IN0"],
);

console.log("chat-read-keys ok");
