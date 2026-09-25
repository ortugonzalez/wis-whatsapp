import { createAdminClient } from "@/lib/supabase/admin";
import { ingestKapsoWebhookEvent } from "@/lib/kapso/ingest-message";
import { verifyKapsoWebhookSignature } from "@/lib/kapso/verify-signature";

export const runtime = "nodejs";

/**
 * Kapso phone webhook (kind=kapso) for sector kapso-demo.
 * Raw body required for HMAC; ack 200 fast after durable ingest.
 */
export async function POST(request: Request) {
  const secret = process.env.KAPSO_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    return new Response("Webhook not configured", { status: 503 });
  }

  const raw = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("x-webhook-signature");
  if (!verifyKapsoWebhookSignature(raw, signature, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = request.headers.get("x-webhook-event")?.trim() ?? "";
  const idempotencyKey =
    request.headers.get("x-idempotency-key")?.trim() || null;

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Batched received: process each item (Kapso buffer).
  const body = payload as {
    batch?: boolean;
    data?: unknown[];
    message?: unknown;
  };

  try {
    const supabase = createAdminClient();

    if (body.batch === true && Array.isArray(body.data)) {
      for (let i = 0; i < body.data.length; i++) {
        const item = body.data[i];
        const result = await ingestKapsoWebhookEvent(supabase, {
          event: event || "whatsapp.message.received",
          // One Kapso key per delivery; index keeps partial batch retries safe.
          idempotencyKey: idempotencyKey ? `${idempotencyKey}:${i}` : null,
          payload: item as Parameters<typeof ingestKapsoWebhookEvent>[1]["payload"],
        });
        if (!result.ok) {
          console.error("kapso_webhook_item_failed", result.error);
          return new Response("Processing failed", { status: 500 });
        }
      }
      return new Response("OK", { status: 200 });
    }

    const result = await ingestKapsoWebhookEvent(supabase, {
      event,
      idempotencyKey,
      payload: payload as Parameters<typeof ingestKapsoWebhookEvent>[1]["payload"],
    });
    if (!result.ok) {
      console.error("kapso_webhook_failed", result.error);
      return new Response("Processing failed", { status: 500 });
    }
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("kapso_webhook_exception", err);
    return new Response("Processing failed", { status: 500 });
  }
}
