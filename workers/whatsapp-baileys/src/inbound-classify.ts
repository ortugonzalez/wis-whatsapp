/** Pure helpers for inbound message typing (no Baileys runtime required). */

export type InboundV1Type = "text" | "image" | "audio" | "document";

export type ClassifyResult =
  | { kind: "v1"; type: InboundV1Type }
  | { kind: "skip"; reason: string };

/** Map Baileys getContentType() keys to CRM v1 types. */
export function classifyContentType(
  contentType: string | undefined | null,
): ClassifyResult {
  if (!contentType) return { kind: "skip", reason: "empty_content" };

  switch (contentType) {
    case "conversation":
    case "extendedTextMessage":
      return { kind: "v1", type: "text" };
    case "imageMessage":
      return { kind: "v1", type: "image" };
    case "audioMessage":
      return { kind: "v1", type: "audio" };
    case "documentMessage":
    case "documentWithCaptionMessage":
      return { kind: "v1", type: "document" };
    default:
      return { kind: "skip", reason: `unsupported:${contentType}` };
  }
}

export function previewForMessage(
  type: InboundV1Type,
  body: string | null,
): string {
  if (body && body.trim()) return body.trim().slice(0, 120);
  switch (type) {
    case "image":
      return "[imagen]";
    case "audio":
      return "[audio]";
    case "document":
      return "[documento]";
    default:
      return "";
  }
}

export function extForMime(mime: string | undefined | null, type: InboundV1Type): string {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "audio/ogg" || m === "audio/opus") return "ogg";
  if (m === "audio/mpeg") return "mp3";
  if (m === "audio/mp4") return "m4a";
  if (m === "application/pdf") return "pdf";
  if (type === "image") return "jpg";
  if (type === "audio") return "ogg";
  if (type === "document") return "bin";
  return "bin";
}

/** Normalize MIME into bucket allowlist; null = do not upload. */
export function coerceUploadMime(
  mime: string | undefined | null,
  type: InboundV1Type,
): string | null {
  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "audio/ogg",
    "audio/mpeg",
    "audio/mp4",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  const raw = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (raw && allowed.has(raw)) return raw;
  if (raw === "audio/opus") return "audio/ogg";
  if (type === "image") return "image/jpeg";
  if (type === "audio") return "audio/ogg";
  if (type === "document") return "application/pdf";
  return null;
}
