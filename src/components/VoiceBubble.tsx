'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  url: string;
  durationSec: number;
  isMine: boolean;
}

/**
 * Compact, single-bubble player for AUDIO messages. Reads the metadata from
 * the `<audio>` element on first load so the displayed duration falls back
 * to the recorder-reported one if metadata isn't immediately available
 * (Chrome's webm/opus blobs occasionally report Infinity until seek).
 */
export function VoiceBubble({ url, durationSec, isMine }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // Track the resolved duration separately so we can replace the recorder
  // estimate with the element's truth once it loads metadata.
  const [resolvedDuration, setResolvedDuration] = useState(durationSec);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setResolvedDuration(el.duration);
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, []);

  async function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      try {
        await el.play();
        setPlaying(true);
      } catch {
        // Autoplay/permission errors — surface silently; the user just won't hear it.
      }
    }
  }

  const safeDuration = Number.isFinite(resolvedDuration) && resolvedDuration > 0
    ? resolvedDuration
    : durationSec;
  const progressPct = safeDuration > 0
    ? Math.min(100, (currentTime / safeDuration) * 100)
    : 0;

  // Inverse contrast: outgoing bubble is graphite glass with white text, so
  // the player track + button need to read on dark; incoming uses subtle
  // graphite on the lighter bubble.
  const btnClass = isMine
    ? 'bg-white/25 text-white hover:bg-white/35'
    : 'bg-[#007aff]/15 dark:bg-[#0a84ff]/15 text-[#007aff] dark:text-[#0a84ff] hover:bg-[#007aff]/25 dark:hover:bg-[#0a84ff]/25';
  const trackBase = isMine ? 'bg-white/20' : 'bg-[#1d1d1f]/15 dark:bg-white/15';
  const trackFill = isMine ? 'bg-white' : 'bg-[#007aff] dark:bg-[#0a84ff]';
  const timeClass = isMine
    ? 'text-white/70'
    : 'text-[#8e8e93] dark:text-[#9a9aa3]';

  return (
    <div className="flex items-center gap-3 px-3 py-2 min-w-[200px] sm:min-w-[240px]">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-[1.04] active:scale-[0.95] ${btnClass}`}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="flex-1 min-w-0">
        {/* Progress track */}
        <div className={`h-1 rounded-full ${trackBase} overflow-hidden`}>
          <div
            className={`h-full ${trackFill} transition-[width] duration-200`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className={`mt-1 text-[11px] tabular-nums ${timeClass}`}>
          {formatTime(playing || currentTime > 0 ? currentTime : safeDuration)}
        </div>
      </div>

      {/* Hidden native audio element drives playback. preload=metadata keeps
          the request light until the user actually presses play. */}
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M6 4.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 6 4.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-current" aria-hidden="true">
      <rect x="5" y="4" width="3.5" height="12" rx="1" />
      <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
    </svg>
  );
}
