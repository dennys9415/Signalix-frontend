'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const IS_DEV = process.env.NODE_ENV !== 'production';

export function ServiceWorkerRegistration() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) {
      if (IS_DEV) console.warn('[signalix-sw] navigator.serviceWorker not available');
      return;
    }

    // Register on load so the SW request doesn't compete with the
    // initial page resources. Surface errors loudly — silently swallowed
    // registration failures previously made push debugging impossible.
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (IS_DEV) {
          console.info('[signalix-sw] register() resolved', {
            scope: registration.scope,
            active: registration.active?.state ?? null,
            installing: registration.installing?.state ?? null,
            waiting: registration.waiting?.state ?? null,
          });
        }
        // Optionally also log when it transitions to controlling this page.
        if (IS_DEV) {
          navigator.serviceWorker.ready
            .then((reg) => console.info('[signalix-sw] ready', { scope: reg.scope, state: reg.active?.state }))
            .catch((e) => console.error('[signalix-sw] ready rejected', e));
        }
      } catch (err) {
        console.error('[signalix-sw] register() failed', err);
      }
    };

    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', register, { once: true });

    // When the user clicks a push notification while a Signalix window is
    // already open, the SW asks us to navigate client-side instead of
    // reloading. We use the App Router to keep the SPA experience.
    const onMessage = (event: MessageEvent<{ type?: string; path?: string }>) => {
      if (event.data?.type === 'NAVIGATE' && typeof event.data.path === 'string') {
        router.push(event.data.path);
        window.focus();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  return null;
}
