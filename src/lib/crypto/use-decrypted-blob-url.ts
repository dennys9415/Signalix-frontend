'use client';

// v0.11.0 — render-time hook for encrypted attachments.
//
// Given a parsed attachment record that *might* carry AES-GCM key
// material (the v0.11.0 schema), this hook returns a usable `src`:
//   • If no key material is present (legacy v0.10.x plaintext rows),
//     it returns the raw URL — `<img src={…}>` works directly.
//   • If key material IS present, it fetches the encrypted blob,
//     decrypts in memory with WebCrypto, and exposes a one-shot
//     `blob:` URL for the component to render. The blob URL is
//     revoked on unmount or when the inputs change, so we don't
//     leak browser memory.
//
// Failures (network, auth tag mismatch, malformed metadata) surface as
// `error: true`. The component renders the `[Unable to decrypt
// attachment]` UI in that case — same sentinel the store would have
// embedded if it had decrypted the metadata envelope.

import { useEffect, useState } from 'react';
import { decodeIvFromWire, decodeKeyFromWire, decryptFile } from './file-crypto';

export interface EncryptedAttachment {
  url: string;
  mime?: string;
  /** base64url AES-256-GCM key (present iff this is a v0.11.0 encrypted attachment). */
  k?: string;
  /** base64url 12-byte GCM IV (present iff `k` is present). */
  iv?: string;
}

export interface DecryptedBlobUrl {
  /** Best `src` to render. Falls back to the raw URL for plaintext rows. */
  src: string | null;
  loading: boolean;
  error: boolean;
}

export function useDecryptedBlobUrl(info: EncryptedAttachment | null): DecryptedBlobUrl {
  const [state, setState] = useState<DecryptedBlobUrl>({ src: null, loading: !!info, error: false });

  useEffect(() => {
    if (!info) {
      setState({ src: null, loading: false, error: false });
      return;
    }

    // Plaintext fast path — no key, no fetch+decrypt overhead. The
    // browser handles the URL directly.
    if (!info.k || !info.iv) {
      setState({ src: info.url, loading: false, error: false });
      return;
    }

    let cancelled = false;
    let blobUrl: string | null = null;

    (async () => {
      try {
        setState({ src: null, loading: true, error: false });
        const res = await fetch(info.url);
        if (!res.ok) throw new Error(`Encrypted blob fetch failed: ${res.status}`);
        const ct = new Uint8Array(await res.arrayBuffer());
        const key = decodeKeyFromWire(info.k!);
        const iv = decodeIvFromWire(info.iv!);
        const plain = await decryptFile(ct, key, iv);
        if (cancelled) return;
        const blob = new Blob([plain as unknown as BlobPart], { type: info.mime || 'application/octet-stream' });
        blobUrl = URL.createObjectURL(blob);
        setState({ src: blobUrl, loading: false, error: false });
      } catch {
        if (!cancelled) setState({ src: null, loading: false, error: true });
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [info?.url, info?.k, info?.iv, info?.mime]);

  return state;
}

/**
 * Companion to `useDecryptedBlobUrl` for download flows. Fetches +
 * decrypts the blob and triggers a save-as. Used by file attachments
 * where we don't want a long-lived blob URL (the file may be large).
 */
export async function downloadDecryptedAttachment(
  info: EncryptedAttachment,
  filename: string,
): Promise<void> {
  const res = await fetch(info.url);
  if (!res.ok) throw new Error(`Encrypted blob fetch failed: ${res.status}`);
  const ct = new Uint8Array(await res.arrayBuffer());

  let plain: Uint8Array;
  if (info.k && info.iv) {
    const key = decodeKeyFromWire(info.k);
    const iv = decodeIvFromWire(info.iv);
    plain = await decryptFile(ct, key, iv);
  } else {
    plain = ct;
  }

  const blob = new Blob([plain as unknown as BlobPart], { type: info.mime || 'application/octet-stream' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Browsers usually flush the download before this microtask runs,
  // but revoke on a short delay to be safe across engines.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
