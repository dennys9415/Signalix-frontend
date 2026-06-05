/* Notification utilities — all calls are best-effort and never throw to callers. */

// ─── Sound ───────────────────────────────────────────────────────────────────

function playTone(freq: number, startAt: number, duration: number, volume: number): void {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);

    osc.start(ctx.currentTime + startAt);
    osc.stop(ctx.currentTime + startAt + duration + 0.02);

    // Release the context once the sound finishes.
    setTimeout(() => ctx.close().catch(() => {}), (startAt + duration + 0.1) * 1000);
  } catch {
    // AudioContext unavailable or blocked.
  }
}

export function playNotificationSound(): void {
  // Two-tone soft chime: A5 then C6
  playTone(880, 0, 0.18, 0.07);
  playTone(1047, 0.17, 0.18, 0.055);
}

// ─── Browser Notification API ─────────────────────────────────────────────────

export function requestNotificationPermission(): void {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  Notification.requestPermission().catch(() => {});
}

export function showBrowserNotification(
  title: string,
  body: string,
  opts?: { icon?: string; chatId?: string },
): void {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const n = new Notification(title, {
      body: body.length > 120 ? body.slice(0, 120) + '…' : body,
      // Per-chat tag so each conversation gets its own coalesced notification.
      tag: opts?.chatId ? `signalix-${opts.chatId}` : 'signalix-message',
      ...(opts?.icon ? { icon: opts.icon } : {}),
      silent: true, // we already play our own sound
    });

    if (opts?.chatId) {
      const path = `/chats/${opts.chatId}`;
      n.onclick = () => {
        window.focus();
        window.location.href = path;
        n.close();
      };
    }

    setTimeout(() => n.close(), 6000);
  } catch {
    // Blocked by browser or notification API unavailable.
  }
}
