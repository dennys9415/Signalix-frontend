'use client';

import { useEffect, useState } from 'react';

// Chrome/Edge fire this with a custom `prompt()` method we can call later.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'signalix-install-dismissed';

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      localStorage.setItem(DISMISS_KEY, '1');
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred || dismissed) return null;

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <div
      role="dialog"
      aria-label="Install Signalix"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] sm:max-w-sm w-fit flex items-center gap-3 px-4 py-2.5 rounded-full bg-white/70 dark:bg-[#1f1f28]/70 backdrop-blur-2xl shadow-glass border border-white/60 dark:border-white/[0.06]"
    >
      <span className="text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7]">
        Install Signalix for a faster, app-like experience.
      </span>
      <button
        onClick={handleInstall}
        className="text-[12px] font-semibold text-white bg-[#007aff] dark:bg-[#0a84ff] hover:opacity-90 px-3 py-1 rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.97]"
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] px-1 transition-colors"
        aria-label="Dismiss"
      >
        Not now
      </button>
    </div>
  );
}
