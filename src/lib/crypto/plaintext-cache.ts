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

export async function lookupPlaintext(messageId: string): Promise<string | undefined> {
  try {
    const rec = await idbGet<PlaintextCacheRecord>(STORE_PLAINTEXT_CACHE, messageId);
    return rec?.plaintext;
  } catch {
    return undefined;
  }
}
