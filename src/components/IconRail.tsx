'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../store/auth.store';
import { getStoredTheme, applyTheme, type Theme } from '../lib/theme';
import { getMe } from '../lib/api-client';
import { Avatar } from './Avatar';

export function IconRail() {
  const session = useAuthStore((s) => s.session);
  const [theme, setTheme] = useState<Theme>('dark');
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; displayName?: string; avatarUrl?: string } | null>(null);
  const pathname = usePathname();

  useEffect(() => { setTheme(getStoredTheme()); }, []);

  useEffect(() => {
    if (!session) return;
    getMe().then(({ user }) => setCurrentUser(user)).catch(() => {});
  }, [session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  function cycleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  const isChats = pathname?.startsWith('/chats');

  return (
    <div className="flex flex-col items-center h-full py-3 gap-1">
      {/* Logo mark */}
      <div className="w-9 h-9 flex items-center justify-center rounded-[14px] bg-[#007aff] shadow-md shadow-[#007aff]/25 mb-2 flex-shrink-0">
        <SignalixMark />
      </div>

      {/* Nav: Chats */}
      <Link
        href="/chats"
        title="Messages"
        className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-150 ${
          isChats
            ? 'bg-[#007aff]/[0.10] text-[#007aff] dark:text-[#0a84ff]'
            : 'text-[#8e8e93] dark:text-[#636375] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'
        }`}
      >
        <ChatBubbleIcon />
      </Link>

      {/* Nav: Contacts (placeholder) */}
      <button
        disabled
        title="Contacts (coming soon)"
        className="w-10 h-10 flex items-center justify-center rounded-2xl text-[#c7c7cc] dark:text-[#3c3c44] cursor-not-allowed"
      >
        <UsersIcon />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <button
        onClick={cycleTheme}
        title={`Theme: ${theme}. Click to cycle.`}
        className="w-10 h-10 flex items-center justify-center rounded-2xl text-[#8e8e93] dark:text-[#636375] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-all duration-150"
      >
        {theme === 'dark' ? <MoonIcon /> : theme === 'light' ? <SunIcon /> : <MonitorIcon />}
      </button>

      {/* Settings */}
      <Link
        href="/settings/profile"
        title="Settings & Profile"
        className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-150 ${
          pathname === '/settings/profile'
            ? 'bg-[#007aff]/[0.10] text-[#007aff] dark:text-[#0a84ff]'
            : 'text-[#8e8e93] dark:text-[#636375] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'
        }`}
      >
        <GearIcon />
      </Link>

      {/* User avatar */}
      <Link href="/settings/profile" title="My profile" className="mt-1 flex-shrink-0">
        {currentUser ? (
          <Avatar
            name={currentUser.displayName ?? currentUser.username}
            seed={currentUser.id}
            avatarUrl={currentUser.avatarUrl}
            size="sm"
            className="ring-2 ring-white/60 dark:ring-[#1c1c24]/60 hover:ring-[#007aff]/40 transition-all"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[#e5e5ea] dark:bg-[#2c2c3a] animate-pulse" />
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

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.1 4.1l1.1 1.1M14.8 14.8l1.1 1.1M15.9 4.1l-1.1 1.1M5.2 14.8l-1.1 1.1" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4.5 h-4.5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 13.5A7.5 7.5 0 1 1 6.5 3a5.5 5.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4.5 h-4.5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg viewBox="0 0 20 20" className="w-4.5 h-4.5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="16" height="11" rx="2" />
      <line x1="7" y1="17" x2="13" y2="17" />
      <line x1="10" y1="14" x2="10" y2="17" />
    </svg>
  );
}
