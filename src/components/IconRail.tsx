'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '../store/auth.store';
import { getStoredTheme, applyTheme, type Theme } from '../lib/theme';
import { getMe } from '../lib/api-client';
import { Avatar } from './Avatar';

interface MeSnapshot {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export function IconRail() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const [theme, setTheme] = useState<Theme>('dark');
  const [me, setMe] = useState<MeSnapshot | null>(null);
  const pathname = usePathname();

  useEffect(() => { setTheme(getStoredTheme()); }, []);

  useEffect(() => {
    if (!session) return;
    getMe().then(({ user }) => setMe(user)).catch(() => {});
  }, [session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  function cycleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  function handleLogout() {
    // auth.store.logout() already disconnects WS + clears persisted session.
    logout();
    router.replace('/login');
  }

  const isChats = pathname?.startsWith('/chats');
  const isProfile = pathname === '/settings/profile';

  // Shared shell for every bottom-rail control so Theme / Logout / Profile
  // all have identical hit areas, radii and animations.
  const railItem = 'w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-200 hover:scale-[1.04] active:scale-[0.98]';
  const railIdle = 'text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/40 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]';
  const railActive = 'bg-white/55 dark:bg-white/[0.08] text-[#1d1d1f] dark:text-[#f5f5f7] backdrop-blur-xl';

  return (
    <div className="flex flex-col items-center h-full py-3 gap-1.5">
      {/* Logo mark — keep blue (primary brand) */}
      <div className="w-9 h-9 flex items-center justify-center rounded-[14px] bg-[#007aff] shadow-glass-sm mb-2 flex-shrink-0">
        <SignalixMark />
      </div>

      {/* Nav: Chats */}
      <Link
        href="/chats"
        title="Messages"
        className={`${railItem} ${isChats ? railActive : railIdle}`}
      >
        <ChatBubbleIcon />
      </Link>

      {/* Nav: Contacts (placeholder) */}
      <button
        disabled
        title="Contacts (coming soon)"
        className="w-10 h-10 flex items-center justify-center rounded-2xl text-[#c7c7cc] dark:text-[#4a4a55] cursor-not-allowed"
      >
        <UsersIcon />
      </button>

      {/* Spacer pushes the trio to the bottom */}
      <div className="flex-1" />

      {/* 1. Theme */}
      <button
        onClick={cycleTheme}
        title={`Theme: ${theme}. Click to cycle.`}
        aria-label="Cycle theme"
        className={`${railItem} ${railIdle}`}
      >
        {theme === 'dark' ? <MoonIcon /> : theme === 'light' ? <SunIcon /> : <MonitorIcon />}
      </button>

      {/* 2. Logout — red accent only kicks in on hover so it doesn't dominate. */}
      <button
        type="button"
        onClick={handleLogout}
        title="Sign out"
        aria-label="Sign out"
        className={`${railItem} text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-red-500/[0.10] dark:hover:bg-red-500/[0.12] hover:text-red-500 dark:hover:text-red-400`}
      >
        <LogoutIcon />
      </button>

      {/* 3. Profile (avatar) — uses the same w-10 h-10 button shell as the
          two above so the trio reads as one icon group. Avatar renders the
          real image when present; falls back to initials via the Avatar
          component when avatarUrl is null. */}
      <Link
        href="/settings/profile"
        title={me ? `Profile · ${me.displayName ?? me.username}` : 'Profile'}
        aria-label="Open profile"
        className={`${railItem} ${isProfile ? railActive : railIdle}`}
      >
        {me ? (
          <Avatar
            name={me.displayName ?? me.username}
            seed={me.id}
            avatarUrl={me.avatarUrl ?? null}
            size="sm"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-white/40 dark:bg-white/[0.06] animate-pulse" />
        )}
      </Link>
    </div>
  );
}

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function SignalixMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-white stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12 C3 6.5 6.5 3 12 3 S21 6.5 21 12 17.5 21 12 21" />
      <path d="M7 12 C7 9 9 7 12 7 S17 9 17 12 15 17 12 17" />
      <circle cx="12" cy="12" r="2" fill="white" stroke="none" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7l-4 3V5z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
      <path d="M2 17a8 8 0 0 1 16 0" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 13.5A7.5 7.5 0 1 1 6.5 3a5.5 5.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="3.5" />
      <line x1="10" y1="2" x2="10" y2="3.5" />
      <line x1="10" y1="16.5" x2="10" y2="18" />
      <line x1="2" y1="10" x2="3.5" y2="10" />
      <line x1="16.5" y1="10" x2="18" y2="10" />
      <line x1="4.4" y1="4.4" x2="5.5" y2="5.5" />
      <line x1="14.5" y1="14.5" x2="15.6" y2="15.6" />
      <line x1="15.6" y1="4.4" x2="14.5" y2="5.5" />
      <line x1="5.5" y1="14.5" x2="4.4" y2="15.6" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="16" height="11" rx="2" />
      <line x1="7" y1="17" x2="13" y2="17" />
      <line x1="10" y1="14" x2="10" y2="17" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Door / panel */}
      <path d="M12 4h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" />
      {/* Arrow pointing out */}
      <polyline points="8 7 4 10 8 13" />
      <line x1="4" y1="10" x2="13" y2="10" />
    </svg>
  );
}
