'use client';

import { useEffect, useState } from 'react';
import { disablePush, enablePush, getPushStatus, type PushStatus } from '../lib/push';

const INITIAL: PushStatus = { supported: false, permission: 'default', subscribed: false };

export function PushSettingsCard() {
  const [status, setStatus] = useState<PushStatus>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const s = await getPushStatus();
        if (mounted) setStatus(s);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      const next = await enablePush();
      setStatus(next);
    } catch (e) {
      setError((e as Error).message ?? 'Could not enable notifications.');
      setStatus(await getPushStatus());
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    try {
      const next = await disablePush();
      setStatus(next);
    } catch (e) {
      setError((e as Error).message ?? 'Could not disable notifications.');
    } finally {
      setBusy(false);
    }
  }

  const blockedByBrowser = status.permission === 'denied';

  return (
    <section>
      <p className="text-[11px] font-semibold text-[#8e8e93] dark:text-[#9a9aa3] uppercase tracking-wider px-1 mb-2">
        Notifications
      </p>
      <div className="rounded-3xl bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl overflow-hidden divide-y divide-white/40 dark:divide-white/[0.05] shadow-glass-sm border border-white/60 dark:border-white/[0.06]">

        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">Push notifications</p>
              <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] mt-0.5">
                {loading
                  ? 'Checking…'
                  : !status.supported
                  ? 'Not supported on this browser.'
                  : blockedByBrowser
                  ? 'Blocked in browser settings.'
                  : status.subscribed
                  ? 'Enabled on this device.'
                  : 'Not enabled on this device.'}
              </p>
            </div>
            <StatusPill status={status} loading={loading} />
          </div>

          {!loading && status.supported && !blockedByBrowser && (
            <div className="flex items-center gap-2 mt-3">
              {status.subscribed ? (
                <button
                  type="button"
                  onClick={() => void handleDisable()}
                  disabled={busy}
                  className="rounded-full bg-white/55 dark:bg-white/[0.06] hover:bg-white/75 dark:hover:bg-white/[0.10] disabled:opacity-50 px-4 py-1.5 text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                >
                  {busy ? 'Disabling…' : 'Disable'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleEnable()}
                  disabled={busy}
                  className="rounded-full bg-[#007aff] dark:bg-[#0a84ff] hover:opacity-90 disabled:opacity-50 px-4 py-1.5 text-[13px] font-semibold text-white shadow-glass-sm transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                >
                  {busy ? 'Enabling…' : 'Enable Push Notifications'}
                </button>
              )}
            </div>
          )}

          {blockedByBrowser && (
            <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] mt-2">
              You previously blocked notifications. Re-enable them from the lock icon in the address bar, then refresh.
            </p>
          )}

          {error && (
            <p className="text-[12px] text-red-500 mt-2">{error}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusPill({ status, loading }: { status: PushStatus; loading: boolean }) {
  if (loading || !status.supported) return null;
  if (status.permission === 'denied') {
    return (
      <span className="flex-shrink-0 inline-flex items-center text-[10px] font-semibold text-red-500 dark:text-red-400 bg-red-50/70 dark:bg-red-500/[0.10] border border-red-300/40 dark:border-red-500/25 rounded-full px-2 py-0.5">
        Blocked
      </span>
    );
  }
  if (status.subscribed) {
    return (
      <span className="flex-shrink-0 inline-flex items-center text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 dark:bg-emerald-500/[0.12] border border-emerald-500/25 rounded-full px-2 py-0.5">
        On
      </span>
    );
  }
  return (
    <span className="flex-shrink-0 inline-flex items-center text-[10px] font-semibold text-[#8e8e93] dark:text-[#9a9aa3] bg-white/55 dark:bg-white/[0.06] border border-white/60 dark:border-white/[0.06] rounded-full px-2 py-0.5">
      Off
    </span>
  );
}
