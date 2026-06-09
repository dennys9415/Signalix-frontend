'use client';

// v0.15.0 — Settings → Security: Create / Restore encrypted backup.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../../../store/auth.store';
import { createBackup, deleteCryptoDb, restoreBackup, type RestoreSummary } from '../../../lib/crypto/backup';
import { generateRecoveryPhrase, normalizeRecoveryPhrase } from '../../../lib/crypto/bip39';

type Mode = 'idle' | 'creating' | 'created' | 'restore-pick' | 'restoring' | 'restored';

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { session, hydrated } = useAuthStore();

  const [mode, setMode] = useState<Mode>('idle');
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePhrase, setRestorePhrase] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace('/login');
  }, [hydrated, session, router]);

  async function handleCreateBackup() {
    setError(null);
    setMode('creating');
    try {
      const newPhrase = generateRecoveryPhrase();
      const blob = await createBackup(newPhrase);
      // Trigger download.
      const a = document.createElement('a');
      const url = URL.createObjectURL(new Blob([blob as unknown as BlobPart], { type: 'application/octet-stream' }));
      a.href = url;
      a.download = `signalix-backup-${new Date().toISOString().slice(0, 10)}.sbk`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPhrase(newPhrase);
      setMode('created');
    } catch (err) {
      setError((err as Error).message || 'Couldn’t create backup');
      setMode('idle');
    }
  }

  async function handleRestore() {
    setError(null);
    if (!restoreFile) { setError('Pick a backup file first'); return; }
    const normalized = normalizeRecoveryPhrase(restorePhrase);
    if (!normalized) { setError('Recovery phrase must be 12 valid words'); return; }
    setMode('restoring');
    try {
      const fileBytes = new Uint8Array(await restoreFile.arrayBuffer());
      const summary = await restoreBackup(fileBytes, normalized);
      setRestoreSummary(summary);
      setMode('restored');
    } catch (err) {
      setError((err as Error).message || 'Restore failed');
      setMode('restore-pick');
    }
  }

  async function handleWipeAndStartFresh() {
    if (!confirm('Wipe local crypto state and start fresh? You will lose access to encrypted history that this device cannot retrieve from peers.')) return;
    await deleteCryptoDb();
    window.location.reload();
  }

  if (!hydrated || !session) return null;

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#0d0d12]">
      <header className="sticky top-0 z-10 backdrop-blur-2xl bg-white/70 dark:bg-[#1f1f28]/70 border-b border-black/[0.06] dark:border-white/[0.05]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/settings/profile"
            className="text-[#007aff] dark:text-[#0a84ff] text-[14px] font-medium"
          >
            ‹ Back
          </Link>
          <h1 className="flex-1 text-center text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Security</h1>
          <span className="w-12" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* About */}
        <section className="rounded-3xl bg-white/85 dark:bg-[#1f1f28]/80 border border-white/60 dark:border-white/[0.06] backdrop-blur-2xl p-5">
          <p className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1">Encrypted backup</p>
          <p className="text-[13px] text-[#6e6e75] dark:text-[#a5a5b0] leading-relaxed">
            A backup contains your device&apos;s identity keys, signed pre-keys, one-time pre-keys, peer fingerprints, and the local plaintext cache. Encrypted with a 12-word recovery phrase that <strong>only you</strong> see — the server never receives the phrase or the unencrypted backup.
          </p>
          <p className="text-[12px] text-[#8e8e93] dark:text-[#6e6e75] mt-2 leading-relaxed">
            Lose the phrase, lose the backup. There is no recovery path.
          </p>
        </section>

        {/* Create */}
        <section className="rounded-3xl bg-white/85 dark:bg-[#1f1f28]/80 border border-white/60 dark:border-white/[0.06] backdrop-blur-2xl p-5">
          <p className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Create backup</p>
          <p className="text-[13px] text-[#6e6e75] dark:text-[#a5a5b0] mt-1 mb-3 leading-relaxed">
            Generates a fresh recovery phrase, encrypts your crypto state, and downloads it as a <code>.sbk</code> file. Save both somewhere safe.
          </p>
          {mode !== 'created' && (
            <button
              onClick={handleCreateBackup}
              disabled={mode === 'creating'}
              className="rounded-full bg-[#007aff] dark:bg-[#0a84ff] text-white text-[14px] font-medium px-5 py-2 hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {mode === 'creating' ? 'Creating…' : 'Create backup'}
            </button>
          )}
          {mode === 'created' && phrase && (
            <RecoveryPhrasePanel phrase={phrase} onDone={() => { setPhrase(''); setMode('idle'); }} />
          )}
        </section>

        {/* Restore */}
        <section className="rounded-3xl bg-white/85 dark:bg-[#1f1f28]/80 border border-white/60 dark:border-white/[0.06] backdrop-blur-2xl p-5">
          <p className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Restore backup</p>
          <p className="text-[13px] text-[#6e6e75] dark:text-[#a5a5b0] mt-1 mb-3 leading-relaxed">
            Picks a <code>.sbk</code> file and your recovery phrase to replace this device&apos;s crypto state. After restore, reload the app.
          </p>
          {mode !== 'restored' && (
            <>
              <div className="flex flex-col gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sbk,application/octet-stream"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                  className="block text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] file:rounded-full file:border-0 file:bg-[#007aff]/[0.10] file:text-[#007aff] dark:file:bg-[#0a84ff]/[0.15] dark:file:text-[#0a84ff] file:px-3 file:py-1.5 file:mr-3 file:text-[12px] file:font-medium"
                />
                <textarea
                  value={restorePhrase}
                  onChange={(e) => setRestorePhrase(e.target.value)}
                  placeholder="Enter your 12-word recovery phrase, separated by spaces"
                  rows={3}
                  className="w-full rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] px-3 py-2 text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder:text-[#8e8e93] focus:outline-none focus:ring-2 focus:ring-[#007aff]/40 font-mono"
                />
                <button
                  onClick={handleRestore}
                  disabled={mode === 'restoring' || !restoreFile || !restorePhrase}
                  className="self-start rounded-full bg-[#007aff] dark:bg-[#0a84ff] text-white text-[14px] font-medium px-5 py-2 hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {mode === 'restoring' ? 'Restoring…' : 'Restore'}
                </button>
              </div>
            </>
          )}
          {mode === 'restored' && restoreSummary && (
            <div className="rounded-2xl bg-emerald-50/85 dark:bg-emerald-500/[0.10] border border-emerald-200/70 dark:border-emerald-400/30 p-3 mt-2">
              <p className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">Backup restored</p>
              <ul className="text-[12px] text-emerald-700/85 dark:text-emerald-300/85 mt-1 space-y-0.5">
                <li>device id: <code>{restoreSummary.deviceId}</code></li>
                <li>signed pre-keys: {restoreSummary.signedPreKeyCount}</li>
                <li>one-time pre-keys: {restoreSummary.preKeyCount}</li>
                <li>plaintext cache entries: {restoreSummary.plaintextCacheCount}</li>
                <li>peer fingerprints: {restoreSummary.fingerprintCount}</li>
                <li>exported: {new Date(restoreSummary.exportedAt).toLocaleString()}</li>
              </ul>
              <button
                onClick={() => window.location.reload()}
                className="mt-3 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white text-[13px] font-medium px-4 py-1.5 hover:opacity-90 transition-opacity"
              >
                Reload to apply
              </button>
            </div>
          )}
        </section>

        {/* Wipe */}
        <section className="rounded-3xl bg-white/85 dark:bg-[#1f1f28]/80 border border-white/60 dark:border-white/[0.06] backdrop-blur-2xl p-5">
          <p className="text-[15px] font-semibold text-amber-700 dark:text-amber-300">Danger zone</p>
          <p className="text-[13px] text-[#6e6e75] dark:text-[#a5a5b0] mt-1 mb-3 leading-relaxed">
            Wipe this device&apos;s local crypto state and force a fresh registration. Use when you can no longer trust the existing identity (suspected key compromise) or when explicitly migrating to a new device.
          </p>
          <button
            onClick={handleWipeAndStartFresh}
            className="rounded-full bg-amber-600/90 dark:bg-amber-500/85 text-white text-[14px] font-medium px-5 py-2 hover:opacity-90 transition-opacity"
          >
            Wipe local keys
          </button>
        </section>

        {error && (
          <div className="rounded-2xl bg-red-50/85 dark:bg-red-500/[0.10] border border-red-200/70 dark:border-red-400/30 px-3 py-2">
            <p className="text-[12px] text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function RecoveryPhrasePanel({ phrase, onDone }: { phrase: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const words = phrase.split(' ');
  async function copy() {
    try { await navigator.clipboard.writeText(phrase); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* no clipboard */ }
  }
  return (
    <div className="space-y-3 mt-2">
      <div className="rounded-2xl bg-amber-50/85 dark:bg-amber-500/[0.10] border border-amber-200/70 dark:border-amber-400/30 px-3 py-2">
        <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-300">Write this down now.</p>
        <p className="text-[11px] text-amber-700/85 dark:text-amber-300/85 mt-0.5">It will not be shown again. Without these 12 words the downloaded backup is unusable.</p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] p-3 font-mono text-[13px]">
        {words.map((w, i) => (
          <div key={i} className="flex items-baseline gap-1.5">
            <span className="text-[10px] text-[#8e8e93] dark:text-[#6e6e75] w-4 text-right">{i + 1}.</span>
            <span className="text-[#1d1d1f] dark:text-[#f5f5f7]">{w}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="rounded-full bg-black/[0.05] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] text-[13px] font-medium px-4 py-1.5 hover:bg-black/[0.08] dark:hover:bg-white/[0.08]"
        >
          {copied ? 'Copied' : 'Copy phrase'}
        </button>
        <button
          onClick={onDone}
          className="rounded-full bg-[#007aff] dark:bg-[#0a84ff] text-white text-[13px] font-medium px-4 py-1.5 hover:opacity-90"
        >
          I&apos;ve written it down
        </button>
      </div>
    </div>
  );
}
