import {
  kapsoInboundStatusMeansRead,
  shouldSkipKapsoReconcileEcho,
} from "./crm-unread";
import { parseKapsoMessageStatusPayload } from "./get-message";
import { kapsoMarkReadBody } from "./mark-read";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const wamid =
  "wamid.HBgNMTU1NTE0OTU5Nzg1FQIAERgSMDhGRjdBMDEyOTcxQzFFQkFBAA==";
const body = kapsoMarkReadBody(wamid);
assert(body.messaging_product === "whatsapp", "product");
assert(body.status === "read", "status read");
assert(body.message_id === wamid, "message_id");

assert(kapsoInboundStatusMeansRead("read") === true, "status read means read");
assert(
  kapsoInboundStatusMeansRead("delivered") === false,
  "delivered not read",
);
assert(kapsoInboundStatusMeansRead(null) === false, "null not read");

assert(
  parseKapsoMessageStatusPayload({
    data: { kapso: { status: "read", direction: "inbound" } },
  }).status === "read",
  "parse wrapped data",
);
assert(
  parseKapsoMessageStatusPayload({
    kapso: { status: "delivered", direction: "inbound" },
  }).status === "delivered",
  "parse bare message",
);

// Suppress map is process-local; echo skip starts false.
assert(
  shouldSkipKapsoReconcileEcho("00000000-0000-4000-8000-000000000001") ===
    false,
  "no suppress without note",
);

console.log("kapso-unread.selfcheck: ok");
