// Local plaintext cache for direct-text E2EE messages.
//
// Since v0.9.0 encrypts only to the recipient's public bundle, the sender
// can't decrypt their own outgoing messages from the server's encrypted
// row. To keep the sender's history readable we cache the plaintext
// locally after a successful send (and after a successful incoming
// decrypt, so reload is also free).

import {
  STORE_PLAINTEXT_CACHE,
  idbGet,
  idbPut,
  type PlaintextCacheRecord,
} from './db';

export async function cachePlaintext(messageId: string, chatId: string, plaintext: string): Promise<void> {
  try {
    const record: PlaintextCacheRecord = {
      messageId,
      chatId,
      plaintext,
      cachedAt: new Date().toISOString(),
    };
    await idbPut<PlaintextCacheRecord>(STORE_PLAINTEXT_CACHE, record);
  } catch {
    // Cache is best-effort; UI just won't have the plaintext on next reload.
  }
}

/**
 * Record that `messageId` failed to decrypt so the UI can short-circuit
 * repeated attempts on history reload. The placeholder text is rendered
 * by the consumer; we only persist the `failed` flag (plus a dev-only
 * reason hint).
 */
export async function cacheDecryptFailure(
  messageId: string,
  chatId: string,
  reason?: string,
): Promise<void> {
  try {
    const record: PlaintextCacheRecord = {
      messageId,
      chatId,
      plaintext: '',
      cachedAt: new Date().toISOString(),
      failed: true,
      ...(reason && process.env.NODE_ENV !== 'production' ? { failedReason: reason } : {}),
    };
    await idbPut<PlaintextCacheRecord>(STORE_PLAINTEXT_CACHE, record);
  } catch {
    // Same best-effort policy.
  }
}

export async function lookupPlaintext(messageId: string): Promise<string | undefined> {
  try {
    const rec = await idbGet<PlaintextCacheRecord>(STORE_PLAINTEXT_CACHE, messageId);
    if (!rec) return undefined;
    if (rec.failed) return undefined;
    return rec.plaintext;
  } catch {
    return undefined;
  }
}

/**
 * Returns true if a prior decrypt attempt for `messageId` was recorded
 * as failed. Callers use this to short-circuit and render the placeholder
 * without rerunning the broken handshake.
 */
export async function isDecryptFailureCached(messageId: string): Promise<boolean> {
  try {
    const rec = await idbGet<PlaintextCacheRecord>(STORE_PLAINTEXT_CACHE, messageId);
    return rec?.failed === true;
  } catch {
    return false;
  }
}
