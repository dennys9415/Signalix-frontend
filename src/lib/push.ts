// Web Push client. Handles permission, browser PushManager subscription,
// and API sync. The service worker itself is registered by
// ServiceWorkerRegistration.tsx on page load, but enablePush() also makes
// sure a registration exists and is ready before subscribing — otherwise
// a subscription could be tied to a SW that's no longer active, which the
// push service then returns as 404/410.

import { getPushPublicKey, pushSubscribe, pushUnsubscribe } from './api-client';

const IS_DEV = process.env.NODE_ENV !== 'production';

function devLog(label: string, data?: unknown): void {
  if (IS_DEV) {
    if (data !== undefined) console.info(`[signalix-push] ${label}`, data);
    else console.info(`[signalix-push] ${label}`);
  }
}

export type PushPermission = 'default' | 'granted' | 'denied';

export interface PushStatus {
  supported: boolean;
  permission: PushPermission;
  subscribed: boolean;
}

/**
 * Capability + permission + subscription snapshot. Safe to call any time
 * (returns supported:false on SSR or unsupported browsers).
 */
export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'default', subscribed: false };
  }
  const supported =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  if (!supported) {
    return { supported: false, permission: 'default', subscribed: false };
  }

  const permission = Notification.permission as PushPermission;
  const registration = await navigator.serviceWorker.getRegistration();
  const existing = registration ? await registration.pushManager.getSubscription() : null;

  return { supported: true, permission, subscribed: !!existing };
}

/**
 * Convert URL-safe base64 VAPID public key to the BufferSource PushManager wants.
 * Uses a freshly-allocated ArrayBuffer so the result satisfies
 * `BufferSource` in stricter TS lib targets.
 */
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buf;
}

/**
 * Idempotently register the service worker and wait until it's active.
 * Returns the active registration we can subscribe against.
 *
 * `ServiceWorkerRegistration.tsx` already registers on page load, but
 * calling register() again is a no-op when one already exists for the
 * scope. Doing it here makes enablePush() self-contained — push works
 * even if the background register hasn't resolved yet, or in scenarios
 * where the previous SW was unregistered (e.g. DevTools "Unregister").
 */
async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.');
  }

  let registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) {
    devLog('no existing registration, calling register()');
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } else {
    devLog('reusing existing registration', { scope: registration.scope });
  }

  // ready resolves once an active SW is controlling the scope. This is the
  // contract PushManager.subscribe() needs.
  const active = await navigator.serviceWorker.ready;
  devLog('sw ready', { scope: active.scope, state: active.active?.state });
  return active;
}

/**
 * Ask for permission (if not already decided), create a PushSubscription via
 * the service worker, and POST it to the API.
 *
 * Always tears down any prior subscription first so the row stored on the
 * server matches a SW that's actually active. Without this step, a stale
 * subscription from a previous SW lifecycle ends up being POST-ed back,
 * which the push service then rejects with 404/410 ("Pruned stale push
 * subscription" in API logs).
 *
 * Throws on user denial, missing VAPID config, or other unrecoverable errors.
 */
export async function enablePush(): Promise<PushStatus> {
  if (typeof window === 'undefined') throw new Error('Not available server-side');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const permission = await Notification.requestPermission();
  devLog('permission', permission);
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const registration = await ensureRegistration();

  // Clean any prior subscription (browser-side AND server-side) before
  // creating a fresh one. This guarantees the saved row matches the
  // currently-active SW lifecycle.
  const stale = await registration.pushManager.getSubscription();
  if (stale) {
    devLog('clearing stale subscription', { endpoint: stale.endpoint });
    try { await pushUnsubscribe(stale.endpoint); } catch { /* best-effort */ }
    try { await stale.unsubscribe(); } catch { /* best-effort */ }
  }

  const publicKey = await getPushPublicKey();
  if (!publicKey) {
    throw new Error('Push is not configured on the server (missing VAPID public key).');
  }
  devLog('fetched VAPID public key', { length: publicKey.length });

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBuffer(publicKey),
  });
  devLog('PushManager.subscribe() returned', { endpoint: subscription.endpoint });

  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error('Browser returned an incomplete push subscription.');
  }

  await pushSubscribe({ endpoint, keys: { p256dh, auth } });
  devLog('subscription saved to API');

  return { supported: true, permission: 'granted', subscribed: true };
}

/**
 * Unsubscribe from the browser PushManager AND remove the record server-side.
 * Idempotent — works even if there's no current subscription.
 */
export async function disablePush(): Promise<PushStatus> {
  if (typeof window === 'undefined') throw new Error('Not available server-side');
  if (!('serviceWorker' in navigator)) {
    return getPushStatus();
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = registration ? await registration.pushManager.getSubscription() : null;

  if (subscription) {
    const endpoint = subscription.endpoint;
    devLog('disable: unsubscribing', { endpoint });
    try { await pushUnsubscribe(endpoint); } catch { /* server unreachable — honour the local intent anyway */ }
    await subscription.unsubscribe();
  } else {
    devLog('disable: no active subscription');
  }

  return {
    supported: true,
    permission: (Notification.permission as PushPermission) ?? 'default',
    subscribed: false,
  };
}
