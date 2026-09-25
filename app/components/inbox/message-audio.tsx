"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSignedMediaUrl } from "@/lib/storage/use-signed-media-url";

type Props = {
  path: string;
};

function formatSecs(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function hasValidDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0;
}

/** WebM from MediaRecorder often reports Infinity/0 until seeked once. */
function fixContainerDuration(audio: HTMLAudioElement): void {
  const seekForDuration = () => {
    if (hasValidDuration(audio.duration)) return;
    audio.currentTime = 1e10;
  };

  audio.addEventListener("loadedmetadata", seekForDuration, { once: true });

  const onTimeUpdate = () => {
    if (!hasValidDuration(audio.duration)) return;
    audio.removeEventListener("timeupdate", onTimeUpdate);
    if (audio.currentTime > 0.05) {
      audio.currentTime = 0;
    }
  };
  audio.addEventListener("timeupdate", onTimeUpdate);
}

async function probeDurationSec(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const ctx = new AudioContext();
    try {
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      return hasValidDuration(decoded.duration) ? decoded.duration : null;
    } finally {
      void ctx.close();
    }
  } catch {
    return null;
  }
}

function PlayIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  );
}

function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [probing, setProbing] = useState(true);

  const readDuration = useCallback(async (audio: HTMLAudioElement) => {
    if (hasValidDuration(audio.duration)) {
      setDuration(audio.duration);
      setProbing(false);
      return;
    }
    setProbing(true);
    const probed = await probeDurationSec(url);
    if (probed != null) setDuration(probed);
    setProbing(false);
  }, [url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setProbing(true);
    fixContainerDuration(audio);

    const onLoaded = () => void readDuration(audio);
    const onDuration = () => {
      if (hasValidDuration(audio.duration)) {
        setDuration(audio.duration);
        setProbing(false);
      }
    };
    const onTime = () => setCurrent(audio.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [url, readDuration]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function onSeek(value: number) {
    const audio = audioRef.current;
    if (!audio || !hasValidDuration(duration)) return;
    audio.currentTime = value;
    setCurrent(value);
  }

  const max = hasValidDuration(duration) ? duration : 0;
  const progress = max > 0 ? Math.min(current / max, 1) : 0;

  return (
    <div className="mt-1 flex min-w-[220px] max-w-full items-center gap-2">
      <audio ref={audioRef} preload="metadata" src={url} className="hidden" />
      <button
        type="button"
        onClick={togglePlay}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-teal)] text-white hover:bg-[var(--color-naranja)]"
        aria-label={playing ? "Pausar audio" : "Reproducir audio"}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={max || 1}
          step={0.05}
          value={max > 0 ? current : 0}
          disabled={max <= 0}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer accent-[var(--color-teal)]"
          aria-label="Posición del audio"
          style={{
            background: `linear-gradient(to right, var(--color-teal) ${progress * 100}%, color-mix(in srgb, var(--color-gris) 25%, white) ${progress * 100}%)`,
          }}
        />
        <p className="mt-0.5 text-[11px] tabular-nums text-[var(--text-muted)]" aria-live="polite">
          {formatSecs(current)} / {probing ? "…" : formatSecs(duration)}
        </p>
      </div>
    </div>
  );
}

/** Signed URL for private message audio; never public CDN. */
export function MessageAudio({ path }: Props) {
  const { url, error, loading } = useSignedMediaUrl(path);

  if (error) {
    return <p className="text-xs text-[var(--danger)]">{error}</p>;
  }
  if (loading || !url) {
    return (
      <p className="text-xs text-[var(--text-muted)]" aria-live="polite">
        Cargando audio…
      </p>
    );
  }

  return <AudioPlayer url={url} />;
}
