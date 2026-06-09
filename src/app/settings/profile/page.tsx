'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { UserProfileResponse } from '@signalix/contracts';
import { useAuthStore } from '../../../store/auth.store';
import { getMe, resendVerification, uploadAvatar, removeAvatar } from '../../../lib/api-client';
import { Avatar } from '../../../components/Avatar';
import { PushSettingsCard } from '../../../components/PushSettingsCard';

const PROVIDER_LABELS: Record<string, string> = {
  local: 'Email & Password',
  google: 'Google',
  github: 'GitHub',
  apple: 'Apple',
};

const ALL_PROVIDERS = ['local', 'google', 'github', 'apple'];

export default function ProfilePage() {
  const router = useRouter();
  const { session, hydrated, logout } = useAuthStore();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editMenuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) {
        setEditMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [editMenuOpen]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) { router.replace('/login'); return; }
    getMe().then(setProfile).catch(() => {});
  }, [hydrated, session, router]);

  async function handleResend() {
    if (resending || resendSent || !profile) return;
    setResending(true);
    try {
      await resendVerification(profile.user.email);
      setResendSent(true);
    } catch {
      // anti-enumeration: API always returns 200
    } finally {
      setResending(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const { avatarUrl } = await uploadAvatar(file);
      setProfile((p) => p ? { ...p, user: { ...p.user, avatarUrl } } : p);
    } catch {
      setAvatarError('Upload failed. Use a JPEG, PNG, or WebP under 5 MB.');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveAvatar() {
    if (!profile?.user?.avatarUrl) return;
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      await removeAvatar();
      setProfile((p) => p ? { ...p, user: { ...p.user, avatarUrl: undefined } } : p);
    } catch {
      setAvatarError('Failed to remove avatar.');
    } finally {
      setAvatarUploading(false);
    }
  }

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  if (!hydrated || !session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 rounded-full border-2 border-[#007aff] dark:border-[#0a84ff] border-t-transparent animate-spin" />
          <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">Loading…</p>
        </div>
      </div>
    );
  }

  const { user, providers } = profile;
  const displayName = user.displayName ?? user.username;
  const showResend = !user.isVerified && providers.includes('local');

  return (
    // h-full + overflow-y-auto so content scrolls inside the viewport-locked
    // body (html/body are 100dvh/overflow:hidden in globals.css for the chats
    // shell). Sticky nav stays pinned relative to this scrolling container.
    <div className="h-full overflow-y-auto">

      {/* Nav bar */}
      <div className="sticky top-0 z-10 bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl border-b border-white/40 dark:border-white/[0.05]">
        <div className="flex items-center px-4 py-3 max-w-lg mx-auto relative">
          <Link
            href="/chats"
            className="flex items-center gap-1 text-[#007aff] dark:text-[#0a84ff] hover:opacity-75 transition-opacity"
            aria-label="Back to chats"
          >
            <BackArrowIcon />
            <span className="text-[17px]">Back</span>
          </Link>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
            Profile
          </h1>
        </div>
      </div>

      {/* Avatar hero */}
      <div className="flex flex-col items-center gap-3 pt-8 pb-6 px-4">

        {/* Avatar with upload spinner */}
        <div className="relative">
          <Avatar name={displayName} seed={user.id} avatarUrl={user.avatarUrl} size="xl" />
          {avatarUploading && (
            <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40">
              <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleAvatarChange}
        />

        {/* Editar button + dropdown */}
        <div className="relative" ref={editMenuRef}>
          <button
            type="button"
            onClick={() => setEditMenuOpen((v) => !v)}
            disabled={avatarUploading}
            className="text-[14px] font-medium text-[#007aff] dark:text-[#0a84ff] hover:opacity-75 active:opacity-60 transition-opacity disabled:opacity-40 select-none"
          >
            Editar
          </button>

          {editMenuOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 rounded-2xl bg-white/80 dark:bg-[#1f1f28]/80 backdrop-blur-2xl shadow-glass border border-white/60 dark:border-white/[0.06] overflow-hidden z-20 py-1">
              {user.avatarUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => { setEditMenuOpen(false); fileInputRef.current?.click(); }}
                    className="w-full text-left px-4 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-white/55 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    Change photo
                  </button>
                  <div className="mx-4 border-t border-white/50 dark:border-white/[0.05]" />
                  <button
                    type="button"
                    onClick={() => { setEditMenuOpen(false); void handleRemoveAvatar(); }}
                    className="w-full text-left px-4 py-2.5 text-[14px] text-red-500 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-900/15 transition-colors"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEditMenuOpen(false); fileInputRef.current?.click(); }}
                  className="w-full text-left px-4 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-white/55 dark:hover:bg-white/[0.06] transition-colors"
                >
                  Add photo
                </button>
              )}
            </div>
          )}
        </div>

        {avatarError && (
          <p className="text-[12px] text-red-500 text-center max-w-[220px]">{avatarError}</p>
        )}

        <div className="text-center">
          <p className="text-[22px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">{displayName}</p>
          <p className="text-[14px] text-[#8e8e93] mt-0.5">@{user.username}</p>
        </div>
      </div>

      {/* Content — generous bottom padding so the last option (Sign Out)
          stays reachable above the iOS home indicator and any browser chrome. */}
      <div
        className="max-w-lg mx-auto px-4 space-y-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2.5rem)' }}
      >

        {/* Email verification warning */}
        {showResend && (
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50/90 dark:bg-amber-900/10 border border-amber-200/60 dark:border-amber-700/30 px-4 py-3.5 backdrop-blur-sm">
            <WarningIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-amber-700 dark:text-amber-400">Email not verified</p>
              <p className="text-[12px] text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                Check your inbox for a verification link.
              </p>
              {resendSent ? (
                <p className="text-[12px] text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                  ✓ Email sent. Check your inbox.
                </p>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="mt-2 text-[12px] font-semibold text-[#007aff] dark:text-[#0a84ff] hover:opacity-75 transition-opacity disabled:opacity-50"
                >
                  {resending ? 'Sending…' : 'Resend verification email'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Account info */}
        <section>
          <SectionLabel>Account</SectionLabel>
          <div className="rounded-3xl bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl overflow-hidden divide-y divide-white/40 dark:divide-white/[0.05] shadow-glass-sm border border-white/60 dark:border-white/[0.06]">
            <Row label="Email">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7]">{user.email}</span>
                <VerifiedBadge verified={user.isVerified} />
              </div>
            </Row>
            <Row label="Username">
              <span className="text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7]">@{user.username}</span>
            </Row>
            <Row label="User ID">
              <span className="text-[11px] font-mono text-[#8e8e93] truncate max-w-[160px]">{user.id}</span>
            </Row>
          </div>
        </section>

        {/* Security shortcut */}
        <section>
          <SectionLabel>Security</SectionLabel>
          <Link
            href="/settings/security"
            className="block rounded-3xl bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl shadow-glass-sm border border-white/60 dark:border-white/[0.06] px-4 py-3.5 hover:bg-white/70 dark:hover:bg-white/[0.06] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-[#007aff] dark:text-[#0a84ff]">
                <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 17s6-3 6-8V4l-6-2-6 2v5c0 5 6 8 6 8z" />
                </svg>
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">Encrypted backup & recovery</p>
                <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3]">Create or restore an encrypted backup of your device keys.</p>
              </div>
              <span className="text-[#c7c7cc] dark:text-[#48484a]">›</span>
            </div>
          </Link>
        </section>

        {/* Push notifications */}
        <PushSettingsCard />

        {/* Connected providers */}
        <section>
          <SectionLabel>Connected accounts</SectionLabel>
          <div className="rounded-3xl bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl overflow-hidden divide-y divide-white/40 dark:divide-white/[0.05] shadow-glass-sm border border-white/60 dark:border-white/[0.06]">
            {ALL_PROVIDERS.map((p) => {
              const connected = providers.includes(p);
              return (
                <div key={p} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center">{PROVIDER_ICONS[p]}</span>
                  <span className="flex-1 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7]">
                    {PROVIDER_LABELS[p]}
                  </span>
                  {connected ? (
                    <span className="flex items-center gap-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircleIcon className="w-3.5 h-3.5" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-[12px] text-[#c7c7cc] dark:text-[#3c3c44]">Not connected</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 rounded-full bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl border border-red-300/50 dark:border-red-500/25 hover:bg-red-50/70 dark:hover:bg-red-500/[0.10] px-4 py-3.5 text-[15px] font-semibold text-red-500 dark:text-red-400 transition-all duration-200 shadow-glass-sm hover:scale-[1.01] active:scale-[0.99]"
        >
          <LogoutIcon />
          Sign Out
        </button>

      </div>
    </div>
  );
}

/* ─── Small helpers ─────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider px-1 mb-2">
      {children}
    </p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span className="text-[14px] text-[#8e8e93] flex-shrink-0">{label}</span>
      <div className="min-w-0 flex justify-end">{children}</div>
    </div>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-700/30 rounded-full px-2 py-0.5">
        <CheckCircleIcon className="w-3 h-3" />
        Verified
      </span>
    );
  }
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/30 rounded-full px-2 py-0.5">
      <WarningIcon className="w-3 h-3" />
      Unverified
    </span>
  );
}

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="12 4 6 10 12 16" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`fill-none stroke-current stroke-[1.8] ${className}`} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="8" />
      <polyline points="6.5 10 9 12.5 13.5 7.5" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`fill-none stroke-current stroke-[1.6] ${className}`} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.05 2.9a1.1 1.1 0 0 1 1.9 0l7.1 12.4A1.1 1.1 0 0 1 17.1 17H2.9a1.1 1.1 0 0 1-.95-1.7L9.05 2.9z" />
      <line x1="10" y1="8" x2="10" y2="12" />
      <circle cx="10" cy="14.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 10H3m0 0 3-3m-3 3 3 3" />
      <path d="M8 7V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-2" />
    </svg>
  );
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  local: (
    <svg viewBox="0 0 20 20" className="w-5 h-5 text-[#8e8e93] fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="16" height="13" rx="2" />
      <polyline points="2 7 10 12 18 7" />
    </svg>
  ),
  google: (
    <svg viewBox="0 0 20 20" className="w-5 h-5" aria-hidden="true">
      <path d="M18.17 10.2c0-.63-.06-1.25-.17-1.84H10v3.48h4.59a3.93 3.93 0 0 1-1.7 2.57v2.14h2.75c1.6-1.48 2.53-3.65 2.53-6.35z" fill="#4285F4"/>
      <path d="M10 18.5c2.3 0 4.23-.76 5.64-2.05l-2.75-2.14c-.76.51-1.73.81-2.89.81-2.22 0-4.1-1.5-4.77-3.52H2.38v2.21A8.5 8.5 0 0 0 10 18.5z" fill="#34A853"/>
      <path d="M5.23 11.6A5.1 5.1 0 0 1 4.96 10c0-.55.1-1.09.27-1.6V6.19H2.38A8.5 8.5 0 0 0 1.5 10c0 1.37.33 2.67.88 3.81l2.85-2.21z" fill="#FBBC05"/>
      <path d="M10 4.88c1.25 0 2.37.43 3.25 1.27l2.44-2.44C14.22 2.33 12.3 1.5 10 1.5A8.5 8.5 0 0 0 2.38 6.19l2.85 2.21C5.9 6.38 7.78 4.88 10 4.88z" fill="#EA4335"/>
    </svg>
  ),
  github: (
    <svg viewBox="0 0 20 20" className="w-5 h-5 text-[#1d1d1f] dark:text-[#f5f5f7] fill-current" aria-hidden="true">
      <path d="M10 1.5a8.5 8.5 0 0 0-2.686 16.567c.425.078.58-.184.58-.41 0-.2-.007-.733-.011-1.44-2.364.514-2.863-1.139-2.863-1.139-.387-.983-.945-1.245-.945-1.245-.772-.527.058-.517.058-.517.854.06 1.303.877 1.303.877.758 1.298 1.99.923 2.474.706.077-.549.297-.923.54-1.135-1.888-.215-3.872-.944-3.872-4.203 0-.929.331-1.689.875-2.284-.088-.214-.38-1.08.083-2.25 0 0 .714-.228 2.34.872A8.155 8.155 0 0 1 10 6.84c.723.003 1.45.098 2.13.287 1.624-1.1 2.337-.872 2.337-.872.465 1.17.172 2.036.085 2.25.545.595.874 1.355.874 2.284 0 3.267-1.987 3.986-3.881 4.197.305.262.577.781.577 1.574 0 1.137-.01 2.054-.01 2.333 0 .228.153.492.584.409A8.5 8.5 0 0 0 10 1.5z" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 20 20" className="w-5 h-5 text-[#1d1d1f] dark:text-[#f5f5f7] fill-current" aria-hidden="true">
      <path d="M14.25 1c.18 1.07-.3 2.14-.96 2.9-.68.8-1.77 1.42-2.85 1.34-.21-1.04.37-2.13 1-2.85C12.12 1.6 13.2.98 14.25 1zm2.62 4.74c-1.23-.74-2.62-.7-3.37-.7-.77 0-2.08.68-3.1.68-.96 0-2.14-.65-3.36-.65C4.97 5.07 2.5 7.04 2.5 10.67c0 4.38 3.34 9.33 5.26 9.33.94 0 1.68-.64 2.76-.64 1.1 0 1.68.65 2.82.65 2.06 0 5.16-4.72 5.16-8.6 0-.04-2.17-1.19-2.17-3.67 0-2.17 1.6-3.1 1.64-3.1z" />
    </svg>
  ),
};
