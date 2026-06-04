'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { UserProfileResponse } from '@signalix/contracts';
import { useAuthStore } from '../../../store/auth.store';
import { getMe, resendVerification } from '../../../lib/api-client';
import { Avatar } from '../../../components/Avatar';

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

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  if (!hydrated || !session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-sm text-gray-500 dark:text-zinc-500">Loading profile…</p>
        </div>
      </div>
    );
  }

  const { user, providers } = profile;
  const displayName = user.displayName ?? user.username;
  const showResend = !user.isVerified && providers.includes('local');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">

      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
        <Link
          href="/chats"
          className="flex items-center justify-center w-8 h-8 rounded-full text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Back to chats"
        >
          <BackArrowIcon />
        </Link>
        <h1 className="text-base font-semibold text-gray-900 dark:text-zinc-100">Profile</h1>
      </div>

      {/* Avatar hero */}
      <div className="flex flex-col items-center gap-3 pt-10 pb-6 px-4 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
        <Avatar name={displayName} seed={user.id} size="xl" />
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900 dark:text-zinc-100">{displayName}</p>
          <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">@{user.username}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Email verification warning */}
        {showResend && (
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 px-4 py-3.5">
            <WarningIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Email not verified</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                Check your inbox for a verification link.
              </p>
              {resendSent ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                  ✓ Email sent. Check your inbox.
                </p>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
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
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 overflow-hidden divide-y divide-gray-100 dark:divide-zinc-800">
            <Row label="Email">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-sm text-gray-700 dark:text-zinc-200">{user.email}</span>
                <VerifiedBadge verified={user.isVerified} />
              </div>
            </Row>
            <Row label="Username">
              <span className="text-sm text-gray-700 dark:text-zinc-200">@{user.username}</span>
            </Row>
            <Row label="User ID">
              <span className="text-xs font-mono text-gray-400 dark:text-zinc-500 truncate max-w-[180px]">{user.id}</span>
            </Row>
          </div>
        </section>

        {/* Connected providers */}
        <section>
          <SectionLabel>Connected accounts</SectionLabel>
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 overflow-hidden divide-y divide-gray-100 dark:divide-zinc-800">
            {ALL_PROVIDERS.map((p) => {
              const connected = providers.includes(p);
              return (
                <div key={p} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex-shrink-0">{PROVIDER_ICONS[p]}</span>
                  <span className="flex-1 text-sm text-gray-800 dark:text-zinc-200">
                    {PROVIDER_LABELS[p]}
                  </span>
                  {connected ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircleIcon className="w-3.5 h-3.5" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-zinc-600">Not connected</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-3 text-sm font-semibold text-red-500 dark:text-red-400 transition-colors"
        >
          <LogoutIcon />
          Log out
        </button>

      </div>
    </div>
  );
}

/* ─── Small helpers ─────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider px-1 mb-2">
      {children}
    </p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span className="text-sm text-gray-500 dark:text-zinc-500 flex-shrink-0">{label}</span>
      <div className="min-w-0 flex justify-end">{children}</div>
    </div>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-full px-2 py-0.5">
        <CheckCircleIcon className="w-3 h-3" />
        Verified
      </span>
    );
  }
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-full px-2 py-0.5">
      <WarningIcon className="w-3 h-3" />
      Unverified
    </span>
  );
}

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg viewBox="0 0 20 20" className="w-5 h-5 text-gray-500 dark:text-zinc-400 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg viewBox="0 0 20 20" className="w-5 h-5 text-gray-700 dark:text-zinc-300 fill-current" aria-hidden="true">
      <path d="M10 1.5a8.5 8.5 0 0 0-2.686 16.567c.425.078.58-.184.58-.41 0-.2-.007-.733-.011-1.44-2.364.514-2.863-1.139-2.863-1.139-.387-.983-.945-1.245-.945-1.245-.772-.527.058-.517.058-.517.854.06 1.303.877 1.303.877.758 1.298 1.99.923 2.474.706.077-.549.297-.923.54-1.135-1.888-.215-3.872-.944-3.872-4.203 0-.929.331-1.689.875-2.284-.088-.214-.38-1.08.083-2.25 0 0 .714-.228 2.34.872A8.155 8.155 0 0 1 10 6.84c.723.003 1.45.098 2.13.287 1.624-1.1 2.337-.872 2.337-.872.465 1.17.172 2.036.085 2.25.545.595.874 1.355.874 2.284 0 3.267-1.987 3.986-3.881 4.197.305.262.577.781.577 1.574 0 1.137-.01 2.054-.01 2.333 0 .228.153.492.584.409A8.5 8.5 0 0 0 10 1.5z" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 20 20" className="w-5 h-5 text-gray-700 dark:text-zinc-300 fill-current" aria-hidden="true">
      <path d="M14.25 1c.18 1.07-.3 2.14-.96 2.9-.68.8-1.77 1.42-2.85 1.34-.21-1.04.37-2.13 1-2.85C12.12 1.6 13.2.98 14.25 1zm2.62 4.74c-1.23-.74-2.62-.7-3.37-.7-.77 0-2.08.68-3.1.68-.96 0-2.14-.65-3.36-.65C4.97 5.07 2.5 7.04 2.5 10.67c0 4.38 3.34 9.33 5.26 9.33.94 0 1.68-.64 2.76-.64 1.1 0 1.68.65 2.82.65 2.06 0 5.16-4.72 5.16-8.6 0-.04-2.17-1.19-2.17-3.67 0-2.17 1.6-3.1 1.64-3.1z" />
    </svg>
  ),
};
