const STORAGE_PREFIX = "whatsapp-ui:inbound-sound:";
const SOUND_SRC = "/sounds/inbound.wav";

export type InboundSoundPref = "on" | "off";

export function inboundSoundStorageKey(sectorId: string): string {
  return `${STORAGE_PREFIX}${sectorId}`;
}

export function readInboundSoundPref(sectorId: string): InboundSoundPref {
  if (typeof window === "undefined") return "on";
  try {
    const raw = window.localStorage.getItem(inboundSoundStorageKey(sectorId));
    if (raw === "off") return "off";
    return "on";
  } catch {
    return "on";
  }
}

export function writeInboundSoundPref(
  sectorId: string,
  pref: InboundSoundPref,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(inboundSoundStorageKey(sectorId), pref);
  } catch {
    // Quota / private mode — preference is session-only.
  }
}

/** Pure gate: whether this Realtime INSERT should trigger a beep. */
export function shouldPlayInboundSound(input: {
  enabled: boolean;
  direction: string | null | undefined;
  conversationId: string | null | undefined;
  activeConversationId: string | null | undefined;
  messageSectorId: string | null | undefined;
  activeSectorId: string;
}): boolean {
  if (!input.enabled) return false;
  if (input.direction !== "in") return false;
  if (!input.conversationId) return false;
  if (
    input.messageSectorId &&
    input.messageSectorId !== input.activeSectorId
  ) {
    return false;
  }
  if (
    input.activeConversationId &&
    input.conversationId === input.activeConversationId
  ) {
    return false;
  }
  return true;
}

let audioEl: HTMLAudioElement | null = null;
let unlockWired = false;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio(SOUND_SRC);
    audioEl.preload = "auto";
  }
  return audioEl;
}

/**
 * Warm the element so later play() is less likely to be blocked.
 * volume=0 (not muted) so the gesture unlocks unmuted playback without a blip.
 * @returns whether play() resolved (gesture unlocked audio).
 */
export function unlockInboundSound(): Promise<boolean> {
  const audio = getAudio();
  if (!audio) return Promise.resolve(false);
  const prevVolume = audio.volume > 0 ? audio.volume : 1;
  audio.volume = 0;
  const p = audio.play();
  if (p && typeof p.then === "function") {
    return p
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = prevVolume;
        return true;
      })
      .catch(() => {
        audio.volume = prevVolume;
        return false;
      });
  }
  audio.volume = prevVolume;
  return Promise.resolve(false);
}

export function ensureInboundSoundUnlockWired(): void {
  if (typeof window === "undefined" || unlockWired) return;
  unlockWired = true;
  const once = () => {
    void unlockInboundSound().then((ok) => {
      if (!ok) return; // Keep listeners — next gesture retries.
      window.removeEventListener("pointerdown", once);
      window.removeEventListener("keydown", once);
    });
  };
  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("keydown", once);
}

export function playInboundSound(): void {
  const audio = getAudio();
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === "function") {
      void p.catch(() => {
        // Browser blocked — leave UI alone.
      });
    }
  } catch {
    // Ignore play errors.
  }
}
