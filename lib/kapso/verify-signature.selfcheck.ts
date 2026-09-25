import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyKapsoWebhookSignature } from "./verify-signature";

const secret = "test-webhook-secret";
const body = Buffer.from('{"message":{"id":"wamid.1"}}', "utf8");
const good = createHmac("sha256", secret).update(body).digest("hex");

assert.equal(verifyKapsoWebhookSignature(body, good, secret), true);
assert.equal(verifyKapsoWebhookSignature(body, "deadbeef", secret), false);
assert.equal(verifyKapsoWebhookSignature(body, null, secret), false);
assert.equal(verifyKapsoWebhookSignature(body, good, ""), false);

console.log("kapso verify-signature: ok");
