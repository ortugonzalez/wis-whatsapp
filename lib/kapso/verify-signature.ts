import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 hex of raw body; compare to X-Webhook-Signature (Kapso docs). */
export function verifyKapsoWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!secret || typeof signatureHeader !== "string" || !signatureHeader) {
    return false;
  }
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
