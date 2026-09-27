import { test } from "node:test";
import assert from "node:assert/strict";
import { messageTimestampIso } from "./history.js";
import { handleInboundMessages } from "./inbound.js";
import { clearWorkerSectorCache } from "./sector.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WASocket } from "baileys";

test("history timestamp converts seconds, strings and Long without inventing dates", () => {
  const iso = "2023-11-14T22:13:20.000Z";
  for (const value of [1700000000, "1700000000", { toNumber: () => 1700000000 }]) assert.equal(messageTimestampIso(value), iso);
  for (const value of [undefined, null, 0, -1, NaN, Infinity, 1700000000000, "bad"]) assert.equal(messageTimestampIso(value), null);
});

test("delivered group history persists import timestamp without any WhatsApp access or unread writes", async () => {
  process.env.SECTOR_SLUG = "history-test";
  clearWorkerSectorCache();
  const writes: { table: string; values: Record<string, unknown> }[] = [];
  const filters: string[] = [];
  const db = { from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit"]) query[method] = () => query;
    query.or = (filter: string) => { filters.push(filter); return query; };
    query.update = query.insert = (values: Record<string, unknown>) => { writes.push({ table, values }); return query; };
    query.maybeSingle = async () => ({ data: table === "sectors" ? {id: "sector"} : table === "conversations" ? {id: "conv"} : null, error: null });
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({data: null, error: null}).then(resolve);
    return query;
  }} as unknown as SupabaseClient;
  const socket = new Proxy({}, { get() { throw new Error("history must not access WhatsApp"); } }) as WASocket;
  await handleInboundMessages(socket, db, [{ key: {id: "history-message", remoteJid: "123@g.us", fromMe: false}, messageTimestamp: 1700000000, message: {conversation: "Historical text"} }], "import");
  const saved = writes.find(w => w.table === "messages")?.values;
  assert.equal(saved?.source, "import");
  assert.equal(saved?.created_at, "2023-11-14T22:13:20.000Z");
  assert.equal(saved?.body, "Historical text");
  assert.equal(writes.some(w => /label|read|outbox/.test(w.table)), false);
  assert.ok(filters.some(f => f.includes("last_message_at.lte.2023-11-14")), "preview update must be conditional on existing timestamp");
  clearWorkerSectorCache();
});
