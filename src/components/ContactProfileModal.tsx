'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Avatar } from './Avatar';
import { PresenceIndicator } from './PresenceIndicator';
import { formatLastSeen } from '../lib/presence';
import { cryptoService } from '../lib/crypto/crypto.service';

interface Props {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null | undefined;
  isOnline: boolean;
  lastSeenAt?: string;
  onClose: () => void;
}

type VerificationStatus = 'unknown' | 'unverified' | 'verified' | 'changed' | 'loading' | 'error';

interface VerificationView {
  status: VerificationStatus;
  safetyNumber: string | null;
  verifiedAt: string | undefined;
}

export function ContactProfileModal({ userId, displayName, username, avatarUrl, isOnline, lastSeenAt, onClose }: Props) {
  const [view, setView] = useState<VerificationView>({ status: 'loading', safetyNumber: null, verifiedAt: undefined });
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    if (!cryptoService.getPeerVerification) {
      setView({ status: 'error', safetyNumber: null, verifiedAt: undefined });
      return;
    }
    try {
      const result = await cryptoService.getPeerVerification(userId);
      if (!result) {
        setView({ status: 'unknown', safetyNumber: null, verifiedAt: undefined });
        return;
      }
      setView({
        status: result.status,
        safetyNumber: result.safetyNumber,
        verifiedAt: result.verifiedAt,
      });
    } catch {
      setView({ status: 'error', safetyNumber: null, verifiedAt: undefined });
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleVerify() {
    if (!cryptoService.markPeerVerified || working) return;
    setWorking(true);
    try {
      await cryptoService.markPeerVerified(userId);
      await refresh();
    } finally {
      setWorking(false);
    }
  }

  async function handleUnverify() {
    if (!cryptoService.unmarkPeerVerified || working) return;
    setWorking(true);
    try {
      await cryptoService.unmarkPeerVerified(userId);
      await refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[340px] rounded-3xl bg-white/75 dark:bg-[#1f1f28]/75 backdrop-blur-2xl shadow-glass border border-white/60 dark:border-white/[0.06] overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-full bg-white/55 dark:bg-white/[0.06] text-[#8e8e93] dark:text-[#9a9aa3] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-colors z-10"
        >
          <CloseIcon />
        </button>

        {/* Avatar hero */}
        <div className="flex flex-col items-center pt-10 pb-5 px-6 bg-gradient-to-b from-white/30 dark:from-white/[0.03] to-transparent">
          <div className="relative">
            <Avatar name={displayName} seed={userId} avatarUrl={avatarUrl} size="xl" />
            <span className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white/70 dark:ring-[#1f1f28]/70">
              <PresenceIndicator online={isOnline} />
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="px-6 pb-5 text-center">
          <p className="text-[18px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{displayName}</p>
          <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3] truncate mt-0.5">@{username}</p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <PresenceIndicator online={isOnline} size="sm" />
            <span className={`text-[12px] font-medium ${isOnline ? 'text-emerald-500' : 'text-[#8e8e93] dark:text-[#9a9aa3]'}`}>
              {isOnline ? 'Online' : formatLastSeen(lastSeenAt)}
            </span>
          </div>
          <p className="text-[10px] text-[#aeaeb2] dark:text-[#5a5a65] mt-3 font-mono select-all leading-relaxed break-all">{userId}</p>
        </div>

        {/* Encryption section */}
        <EncryptionPanel
          view={view}
          working={working}
          onVerify={handleVerify}
          onUnverify={handleUnverify}
          onRefresh={refresh}
        />
      </div>
    </div>
  );
}

interface EncryptionPanelProps {
  view: VerificationView;
  working: boolean;
  onVerify: () => void;
  onUnverify: () => void;
  onRefresh: () => void;
}

function EncryptionPanel({ view, working, onVerify, onUnverify, onRefresh }: EncryptionPanelProps) {
  const { status, safetyNumber, verifiedAt } = view;

  return (
    <div className="border-t border-white/40 dark:border-white/[0.05] px-6 py-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Encryption</p>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#007aff] dark:text-[#0a84ff] bg-[#007aff]/[0.08] dark:bg-[#0a84ff]/[0.10] px-1.5 py-0.5 rounded-full">
          <LockIcon /> End-to-end encrypted beta
        </span>
      </div>

      {status === 'loading' && (
        <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3]">Computing safety number…</p>
      )}

      {status === 'error' && (
        <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3]">
          Couldn&apos;t compute the safety number. Send a message first or retry.
        </p>
      )}

      {status === 'unknown' && (
        <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3]">
          The recipient hasn&apos;t published encryption keys yet. Send a message to bootstrap the session.
        </p>
      )}

      {status === 'changed' && (
        <div className="rounded-2xl border border-amber-200/70 dark:border-amber-400/30 bg-amber-50/85 dark:bg-amber-500/[0.12] px-3 py-2">
          <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-200 mb-0.5 flex items-center gap-1">
            <ShieldWarnIcon /> Security number changed
          </p>
          <p className="text-[11px] text-[#5a5a64] dark:text-[#a5a5b0]">
            The recipient&apos;s identity key has changed since you last verified this chat. Confirm the new number with them before resuming sensitive conversations.
          </p>
        </div>
      )}

      {(status === 'verified' || status === 'unverified' || status === 'changed') && safetyNumber && (
        <>
          <SafetyNumberDisplay safetyNumber={safetyNumber} />
          <QRCodePanel safetyNumber={safetyNumber} />

          <div className="flex items-center justify-between gap-2 pt-1">
            <StatusBadge status={status} verifiedAt={verifiedAt} />
            {status === 'verified' ? (
              <button
                onClick={onUnverify}
                disabled={working}
                className="text-[12px] font-medium text-[#8e8e93] dark:text-[#9a9aa3] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] disabled:opacity-40 transition-colors"
              >
                Unverify
              </button>
            ) : (
              <button
                onClick={onVerify}
                disabled={working}
                className="text-[12px] font-medium text-[#007aff] dark:text-[#0a84ff] hover:text-[#005ecb] dark:hover:text-[#3a99ff] disabled:opacity-40 transition-colors"
              >
                {status === 'changed' ? 'Re-verify' : 'Mark as verified'}
              </button>
            )}
          </div>
        </>
      )}

      {status === 'error' && (
        <button
          onClick={onRefresh}
          className="text-[12px] font-medium text-[#007aff] dark:text-[#0a84ff] hover:text-[#005ecb] dark:hover:text-[#3a99ff] transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function SafetyNumberDisplay({ safetyNumber }: { safetyNumber: string }) {
  // 12 groups of 5 digits — split into two rows for readability.
  const groups = safetyNumber.split('-');
  const top = groups.slice(0, 6).join(' ');
  const bottom = groups.slice(6).join(' ');
  return (
    <div className="rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] px-3 py-2.5 font-mono text-[12px] tracking-wide text-center text-[#1d1d1f] dark:text-[#f5f5f7] select-all leading-relaxed">
      <p>{top}</p>
      <p>{bottom}</p>
    </div>
  );
}

function QRCodePanel({ safetyNumber }: { safetyNumber: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const payload = useMemo(() => `signalix-safety:${safetyNumber}`, [safetyNumber]);

  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, payload, {
      width: 160,
      margin: 1,
      color: { dark: '#1d1d1f', light: '#ffffff' },
    });
  }, [payload]);

  return (
    <div className="flex justify-center pt-1">
      <div className="rounded-2xl bg-white p-2 ring-1 ring-black/5">
        <canvas ref={canvasRef} width={160} height={160} aria-label="Safety number QR code" />
      </div>
    </div>
  );
}

function StatusBadge({ status, verifiedAt }: { status: VerificationStatus; verifiedAt: string | undefined }) {
  if (status === 'verified') {
    const when = verifiedAt ? new Date(verifiedAt).toLocaleDateString() : '';
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <CheckIcon /> Verified{when ? ` • ${when}` : ''}
      </span>
    );
  }
  if (status === 'changed') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
        <ShieldWarnIcon /> No longer verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8e8e93] dark:text-[#9a9aa3]">
      Not verified
    </span>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current stroke-[2.5]" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function ShieldWarnIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 14s5-2.5 5-7V3l-5-2-5 2v4c0 4.5 5 7 5 7z" />
      <line x1="8" y1="6" x2="8" y2="9" />
      <line x1="8" y1="11" x2="8" y2="11.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3,8 7,12 13,4" />
    </svg>
  );
}
