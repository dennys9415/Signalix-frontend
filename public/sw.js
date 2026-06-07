// Signalix service worker — v0.6.0.
//
// Responsibilities:
//   • Satisfy PWA install criteria (registered SW with a fetch handler).
//   • Receive Web Push payloads and surface OS notifications.
//   • Focus an existing Signalix window — or open one — on notification click,
//     navigating to /chats/:chatId when one was supplied in the payload.
//
// Explicitly NOT doing:
//   • Caching API or WebSocket requests — those go straight to the network.
//   • Precaching static assets (left for a later iteration).
//   • Background sync, periodic sync, push without user-visible notification.

const SW_VERSION = 'signalix-pwa-v3';

// install/activate logs surface in DevTools → Application → Service Workers
// → the SW's own console pane. Useful when debugging registration / push.
self.addEventListener('install', (event) => {
  // eslint-disable-next-line no-console
  console.info('[signalix-sw] install', SW_VERSION);
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // eslint-disable-next-line no-console
  console.info('[signalix-sw] activate', SW_VERSION);
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  const isAuthSensitive =
    url.pathname.startsWith('/api/') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:';

  if (isAuthSensitive) return;
  // No-op fetch handler: lets the browser handle requests normally while
  // still meeting the "SW with a fetch handler" install-criteria bar.
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Web Push ──────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  // eslint-disable-next-line no-console
  console.info('[signalix-sw] push received', { hasData: !!event.data });
  let payload = {};
  if (event.data) {
    try { payload = event.data.json(); }
    catch {
      try { payload = { title: 'Signalix', body: event.data.text() }; }
      catch { payload = { title: 'Signalix', body: 'New message' }; }
    }
  }

  const title = typeof payload.title === 'string' && payload.title.length > 0
    ? payload.title
    : 'Signalix';
  const body = typeof payload.body === 'string' && payload.body.length > 0
    ? payload.body
    : 'New message';
  const chatId = typeof payload.chatId === 'string' ? payload.chatId : undefined;
  const icon = typeof payload.avatarUrl === 'string' && payload.avatarUrl
    ? payload.avatarUrl
    : '/icon.svg';

  const options = {
    body,
    icon,
    badge: '/icon.svg',
    // Coalesce multiple pushes for the same chat into a single notification.
    tag: chatId ? `signalix-chat:${chatId}` : 'signalix',
    renotify: true,
    data: { chatId },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const chatId = event.notification.data && event.notification.data.chatId;
  const targetPath = chatId ? `/chats/${chatId}` : '/chats';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    // Prefer focusing an already-open Signalix window. If we have one,
    // ask it to client-side-navigate; otherwise just focus it.
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin !== self.location.origin) continue;
        await client.focus();
        try { client.postMessage({ type: 'NAVIGATE', path: targetPath }); } catch {}
        return;
      } catch {}
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetPath);
    }
  })());
});
