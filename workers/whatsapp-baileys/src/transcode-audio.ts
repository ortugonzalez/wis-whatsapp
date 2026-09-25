import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** CRM voice notes from the browser are usually webm; WhatsApp PTT needs ogg/opus. */
const OGG_MIME = "audio/ogg; codecs=opus";

function ffmpegBin(): string {
  const bundled = require("ffmpeg-static") as string | null;
  return bundled ?? "ffmpeg";
}

function parseDurationSec(output: string): number | null {
  const match = output.match(/Duration:\s(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(parseFloat(match[3]));
  if (!Number.isFinite(h + m + s)) return null;
  return Math.max(1, Math.ceil(h * 3600 + m * 60 + s));
}

/** Read Duration from ffmpeg stderr (execFile only exposes it on non-zero exit). */
function probeDurationSec(filePath: string): Promise<number> {
  const bin = ffmpegBin();
  return new Promise((resolve) => {
    const proc = spawn(bin, ["-hide_banner", "-i", filePath, "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(parseDurationSec(stderr) ?? 1);
    }, 10_000);
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    proc.on("close", () => {
      clearTimeout(timer);
      resolve(parseDurationSec(stderr) ?? 1);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(1);
    });
  });
}

export function needsOggTranscode(mimetype: string, path: string): boolean {
  if (mimetype.includes("ogg")) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return (
    ext === "webm" ||
    ext === "mp4" ||
    ext === "m4a" ||
    mimetype.includes("webm") ||
    mimetype.includes("mp4")
  );
}

/** Probe duration from an in-memory audio blob (ogg/webm/mp4). */
export async function audioDurationSec(
  input: Buffer,
  sourceExt: string,
): Promise<number> {
  const id = randomUUID();
  const inPath = join(tmpdir(), `wa-audio-probe-${id}.${sourceExt || "bin"}`);
  try {
    await writeFile(inPath, input);
    return await probeDurationSec(inPath);
  } finally {
    await unlink(inPath).catch(() => {});
  }
}

/** Transcode browser voice notes to WhatsApp-compatible ogg/opus (PTT). */
export async function toOggOpusPtt(
  input: Buffer,
  sourceExt: string,
): Promise<{ buffer: Buffer; mimetype: string; seconds: number }> {
  const id = randomUUID();
  const inPath = join(tmpdir(), `wa-audio-${id}.${sourceExt || "webm"}`);
  const outPath = join(tmpdir(), `wa-audio-${id}.ogg`);
  const bin = ffmpegBin();

  try {
    await writeFile(inPath, input);
    const secondsFromInput = await probeDurationSec(inPath);

    // Baileys README: libopus + ac:1 + avoid_negative_ts make_zero for WA voice notes.
    await execFileAsync(
      bin,
      [
        "-y",
        "-i",
        inPath,
        "-vn",
        "-map",
        "0:a:0?",
        "-avoid_negative_ts",
        "make_zero",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-application",
        "voip",
        "-f",
        "ogg",
        outPath,
      ],
      { timeout: 45_000 },
    );
    const buffer = await readFile(outPath);
    if (buffer.length === 0) {
      throw new Error("empty_transcode_output");
    }
    const secondsFromOutput = await probeDurationSec(outPath);
    const seconds =
      secondsFromOutput > 1
        ? secondsFromOutput
        : secondsFromInput > 1
          ? secondsFromInput
          : Math.max(secondsFromInput, secondsFromOutput, 1);

    return { buffer, mimetype: OGG_MIME, seconds };
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

export { OGG_MIME };
