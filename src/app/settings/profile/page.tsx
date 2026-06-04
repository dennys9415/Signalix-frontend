'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { UserProfileResponse } from '@signalix/contracts';
import { useAuthStore } from '../../../store/auth.store';
import { getMe, resendVerification } from '../../../lib/api-client';

const PROVIDER_LABELS: Record<string, string> = {
  local: 'Email / Password',
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
    if (!session) {
      router.replace('/login');
      return;
    }
    getMe().then(setProfile).catch(() => {});
  }, [hydrated, session, router]);

  async function handleResend() {
    if (resending || resendSent || !profile) return;
    setResending(true);
    try {
      await resendVerification(profile.user.email);
      setResendSent(true);
    } catch {
      // anti-enumeration: API always returns 200, so errors are network failures
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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const { user, providers } = profile;
  const avatarInitial = (user.displayName ?? user.username).charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        <Link href="/chats" className="inline-block text-xs text-indigo-400 hover:underline">
          ← Back to chats
        </Link>

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="w-20 h-20 rounded-full bg-indigo-700 flex items-center justify-center text-3xl font-bold uppercase select-none">
            {avatarInitial}
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold">{user.displayName ?? user.username}</p>
            <p className="text-sm text-gray-400">@{user.username}</p>
          </div>
        </div>

        {/* Account info */}
        <div className="rounded-lg bg-gray-900 border border-gray-800 divide-y divide-gray-800">
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-sm text-gray-400 flex-shrink-0">Email</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-right truncate">{user.email}</span>
              {user.isVerified ? (
                <span className="flex-shrink-0 text-xs font-medium text-green-400 bg-green-900/30 border border-green-800 rounded-full px-2 py-0.5">
                  Verified
                </span>
              ) : (
                <span className="flex-shrink-0 text-xs font-medium text-amber-400 bg-amber-900/30 border border-amber-800 rounded-full px-2 py-0.5">
                  Unverified
                </span>
              )}
            </div>
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-sm text-gray-400 flex-shrink-0">User ID</span>
            <span className="text-xs text-gray-600 font-mono truncate">{user.id}</span>
          </div>
        </div>

        {/* Resend verification */}
        {!user.isVerified && providers.includes('local') && (
          <div className="rounded-lg bg-amber-900/10 border border-amber-800/50 px-4 py-3 space-y-2">
            <p className="text-xs text-amber-400">
              Your email address has not been verified. Check your inbox or resend the link.
            </p>
            {resendSent ? (
              <p className="text-xs text-green-400">Verification email sent. Check your inbox.</p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="text-xs text-indigo-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resending ? 'Sending…' : 'Resend verification email'}
              </button>
            )}
          </div>
        )}

        {/* Connected providers */}
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider px-1">Connected accounts</p>
          <div className="rounded-lg bg-gray-900 border border-gray-800 divide-y divide-gray-800">
            {ALL_PROVIDERS.map((p) => {
              const connected = providers.includes(p);
              return (
                <div key={p} className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm">{PROVIDER_LABELS[p]}</span>
                  <span
                    className={`text-xs font-medium ${
                      connected ? 'text-green-400' : 'text-gray-600'
                    }`}
                  >
                    {connected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full rounded-md border border-red-800 bg-transparent hover:bg-red-900/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors"
        >
          Log out
        </button>

      </div>
    </div>
  );
}
