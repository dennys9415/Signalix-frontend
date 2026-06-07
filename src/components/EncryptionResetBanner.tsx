'use client';

// v0.9.1 one-time banner. Surfaced when the local crypto bootstrap had
// to regenerate identity keys for this device (corrupt or partially
// wiped IndexedDB). Dismissing the banner ack's the reset so it won't
// reappear on the next render — but the underlying state truly was
// reset, so the user should be aware that historical encrypted
// messages on this device can no longer be decrypted.

import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth.store';
import { cryptoService, getCryptoStatus, acknowledgeCryptoReset } from '../lib/crypto/crypto.service';

export function EncryptionResetBanner() {
  const session = useAuthStore((s) => s.session);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!session) return undefined;
    // crypto.init is idempotent — calling it again returns the same
    // in-flight promise. After it settles we can read wasReset off the
    // status synchronously.
    void cryptoService
      .init({ deviceId: session.deviceId })
      .then(() => {
        if (cancelled) return;
        if (getCryptoStatus().wasReset) setVisible(true);
      })
      .catch(() => {
        // If init failed, the chat surfaces will show their own errors —
        // no banner to add on top of that.
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!visible) return null;

  return (
    <div className="px-4 md:px-6 pt-3">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/70 dark:border-amber-400/30 bg-amber-50/85 dark:bg-amber-500/[0.12] px-4 py-3 backdrop-blur-xl">
        <div className="mt-0.5 text-amber-600 dark:text-amber-300">
          {/* Inline shield icon — keeps the banner zero-dependency. */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
            Encryption keys were reset on this device.
          </p>
          <p className="text-[12px] text-[#5a5a64] dark:text-[#a5a5b0] mt-0.5">
            Fresh keys were generated and published. Messages encrypted to your previous keys can no longer be decrypted on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { acknowledgeCryptoReset(); setVisible(false); }}
          className="text-[12px] font-medium text-amber-700 dark:text-amber-200 hover:text-amber-800 dark:hover:text-amber-100 transition-colors"
          aria-label="Dismiss encryption reset notice"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
