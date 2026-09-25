import assert from "node:assert/strict";
import {
  decideNativeUnreadSync,
  interpretNativeUnreadCount,
  isNativeUnreadBackfillSource,
  shouldHonorNativeReadZero,
} from "./labels.js";

assert.equal(interpretNativeUnreadCount(3), true, ">0 unread");
assert.equal(interpretNativeUnreadCount(0), false, "0 read");
assert.equal(interpretNativeUnreadCount(null), false, "null live = read");
assert.equal(interpretNativeUnreadCount(-1), null, "-1 sentinel ignore");

assert.equal(isNativeUnreadBackfillSource("chats.upsert"), true, "upsert backfill");
assert.equal(isNativeUnreadBackfillSource("history"), true, "history backfill");
assert.equal(isNativeUnreadBackfillSource("history:latest"), false, "latest not lying backfill");
assert.equal(isNativeUnreadBackfillSource("chats.update"), false, "live update");
assert.equal(isNativeUnreadBackfillSource("messages.update:read"), false, "inbound READ");

assert.equal(
  shouldHonorNativeReadZero({ source: "chats.update" }),
  true,
  "live 0 trusted",
);
assert.equal(
  shouldHonorNativeReadZero({ source: "history" }),
  false,
  "incomplete history 0 untrusted",
);
assert.equal(
  shouldHonorNativeReadZero({ source: "history", trustReadZero: true }),
  true,
  "isLatest 0 trusted",
);
assert.equal(
  shouldHonorNativeReadZero({ source: "chats.upsert" }),
  false,
  "upsert 0 untrusted",
);

assert.equal(
  decideNativeUnreadSync({ unreadCount: 2, source: "chats.update" }),
  "unread",
  "live >0",
);
assert.equal(
  decideNativeUnreadSync({ unreadCount: 0, source: "chats.update" }),
  "read",
  "live 0",
);
assert.equal(
  decideNativeUnreadSync({ unreadCount: null, source: "chats.update", trustReadZero: true }),
  "read",
  "live null",
);
assert.equal(
  decideNativeUnreadSync({ unreadCount: -1, source: "chats.update" }),
  "skip",
  "sentinel",
);
assert.equal(
  decideNativeUnreadSync({ unreadCount: undefined, source: "chats.update" }),
  "skip",
  "missing field",
);
assert.equal(
  decideNativeUnreadSync({ unreadCount: 0, source: "chats.upsert" }),
  "skip",
  "lying upsert 0",
);
assert.equal(
  decideNativeUnreadSync({ unreadCount: 4, source: "chats.upsert" }),
  "unread",
  "upsert >0 still applied",
);
assert.equal(
  decideNativeUnreadSync({ unreadCount: 0, source: "history" }),
  "skip",
  "lying history 0",
);
assert.equal(
  decideNativeUnreadSync({
    unreadCount: 0,
    source: "history:latest",
  }),
  "read",
  "reconcile 0 without extra flag",
);
assert.equal(
  decideNativeUnreadSync({
    unreadCount: 0,
    source: "messages.update:read",
    trustReadZero: true,
  }),
  "read",
  "inbound READ",
);

console.log("native-unread ok");
