import {
  extractBizOpaque,
  outboundOriginAuthorLabel,
  parseCrmOpaqueMessageId,
  pickPendingCrmOutbound,
  resolveOutboundOrigin,
} from "./outbound-origin";

const CRM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CAMPANA_ID = "11111111-2222-4333-8444-555555555555";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(parseCrmOpaqueMessageId(`crm:${CRM_ID}`) === CRM_ID, "parse crm opaque");
assert(parseCrmOpaqueMessageId(CAMPANA_ID) === null, "campana not crm");
assert(resolveOutboundOrigin(`crm:${CRM_ID}`) === "crm", "origin crm");
assert(resolveOutboundOrigin(CAMPANA_ID) === "cobranzas", "origin cobranzas");
assert(resolveOutboundOrigin(null) === "system", "origin system empty");
assert(resolveOutboundOrigin("gas-job-1") === "system", "origin system other");
assert(outboundOriginAuthorLabel("cobranzas") === "Cobranzas", "label cobranzas");
assert(outboundOriginAuthorLabel("system") === "Sistema", "label system");
assert(
  extractBizOpaque({
    message: {
      kapso: { statuses: [{ biz_opaque_callback_data: CAMPANA_ID }] },
    },
  }) === CAMPANA_ID,
  "extract from statuses",
);

const picked = pickPendingCrmOutbound(
  [
    {
      id: "sys",
      body: "hola",
      sent_by: null,
      outbound_origin: "system",
    },
    {
      id: "crm-other",
      body: "otro",
      sent_by: "p1",
      outbound_origin: "crm",
    },
    {
      id: "crm-match",
      body: "hola",
      sent_by: "p1",
      outbound_origin: "crm",
    },
  ],
  "hola",
);
assert(picked?.id === "crm-match", "pick prefers matching CRM body");
assert(
  pickPendingCrmOutbound(
    [{ id: "only-sys", body: "x", sent_by: null, outbound_origin: "system" }],
    "x",
  ) === null,
  "pick ignores system-only",
);

console.log("outbound-origin.selfcheck: ok");
