'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PublicUserDTO } from '@signalix/contracts';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { getMe, searchUsers } from '../lib/api-client';
import { getStoredTheme, applyTheme, type Theme } from '../lib/theme';
import { useSidebar } from '../lib/sidebar-context';
import { ChatItem } from './ChatItem';
import { Avatar } from './Avatar';
import { PresenceIndicator } from './PresenceIndicator';

export function ChatSidebar() {
  const params = useParams();
  const router = useRouter();
  const { setOpen } = useSidebar();
  const activeChatId = typeof params?.chatId === 'string' ? params.chatId : null;

  const session = useAuthStore((s) => s.session);
  const chats = useChatStore((s) => s.chats);
  const messages = useChatStore((s) => s.messages);
  const presence = useChatStore((s) => s.presence);
  const setPendingRecipient = useChatStore((s) => s.setPendingRecipient);

  const [currentUser, setCurrentUser] = useState<{ id: string; displayName?: string; username: string } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUserDTO[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, startSearch] = useTransition();
  const [theme, setTheme] = useState<Theme>('dark');
  const searchRef = useRef<HTMLInputElement>(null);

  const currentUserId = session?.userId ?? '';

  useEffect(() => {
    if (!session) return;
    getMe().then(({ user }) => setCurrentUser(user)).catch(() => {});
  }, [session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  function cycleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (!val.trim()) {
      clearSearch();
      return;
    }
    startSearch(async () => {
      try {
        const { users } = await searchUsers(val.trim());
        setResults(users);
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      }
    });
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setSearched(false);
  }

  function startNewChat(user: PublicUserDTO) {
    const existing = chats.find((c) =>
      c.participants.some((p) => p.userId === user.id),
    );
    if (existing) {
      router.push(`/chats/${existing.id}`);
    } else {
      setPendingRecipient(user);
      router.push('/chats');
    }
    clearSearch();
    setOpen(false);
  }

  function handleChatSelect() {
    setOpen(false);
  }

  const isSearching = query.trim().length > 0;

  return (
    <aside className="flex flex-col h-full bg-gray-50 dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800">

      {/* App header */}
      <div className="flex items-center justify-between px-4 py-3.5 flex-shrink-0">
        <span className="text-base font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
          Signalix
        </span>
        <button
          onClick={cycleTheme}
          title={`Theme: ${theme}. Click to switch.`}
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
        >
          {theme === 'dark' ? <MoonIcon /> : theme === 'light' ? <SunIcon /> : <SystemIcon />}
        </button>
      </div>

      {/* Profile strip */}
      {currentUser && (
        <Link
          href="/settings/profile"
          className="flex items-center gap-3 mx-3 mb-2 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors group"
        >
          <div className="relative">
            <Avatar
              name={currentUser.displayName ?? currentUser.username}
              seed={currentUser.id}
              size="md"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-gray-50 dark:ring-zinc-900 shadow-sm" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate text-gray-900 dark:text-zinc-100">
              {currentUser.displayName ?? currentUser.username}
            </p>
            <p className="text-xs text-gray-500 dark:text-zinc-500 truncate">@{currentUser.username}</p>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-gray-400 dark:text-zinc-600 group-hover:text-gray-500 dark:group-hover:text-zinc-400 flex-shrink-0 transition-colors" />
        </Link>
      )}

      {/* Search */}
      <div className="px-3 mb-2 flex-shrink-0">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Search users…"
            className="w-full rounded-xl bg-gray-200/70 dark:bg-zinc-800 border-0 pl-9 pr-9 py-2 text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
            >
              <XSmallIcon />
            </button>
          )}
        </div>
      </div>

      {/* Search results */}
      {isSearching && (
        <div className="flex-1 overflow-y-auto px-3 space-y-0.5">
          {searching && (
            <p className="text-xs text-gray-400 dark:text-zinc-500 px-2 py-2">Searching…</p>
          )}
          {!searching && searched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <NoResultsIcon />
              <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">No users found</p>
              <p className="text-xs text-gray-400 dark:text-zinc-500">Try a different username</p>
            </div>
          )}
          {results.map((user) => {
            const name = user.displayName ?? user.username;
            const isOnline = (presence[user.id] ?? 'offline') === 'online';
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => startNewChat(user)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors text-left"
              >
                <div className="relative flex-shrink-0">
                  <Avatar name={name} seed={user.id} size="md" />
                  {isOnline && (
                    <PresenceIndicator
                      online
                      className="absolute -bottom-0.5 -right-0.5 ring-2 ring-gray-50 dark:ring-zinc-900"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate text-gray-900 dark:text-zinc-100">{name}</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-500 truncate">@{user.username}</p>
                </div>
                {isOnline && (
                  <span className="text-[10px] font-medium text-emerald-500 flex-shrink-0">Online</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Chat list */}
      {!isSearching && (
        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5 pb-2">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4 py-16">
              <EmptyChatIcon />
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Welcome to Signalix</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                  Start a conversation by searching for a username above.
                </p>
              </div>
            </div>
          ) : (
            chats.map((chat) => {
              const chatMsgs = messages[chat.id];
              const lastMessage = chatMsgs ? chatMsgs[chatMsgs.length - 1] : undefined;
              return (
                <div key={chat.id} onClick={handleChatSelect}>
                  <ChatItem
                    chat={chat}
                    currentUserId={currentUserId}
                    presence={presence}
                    active={chat.id === activeChatId}
                    lastMessage={lastMessage}
                  />
                </div>
              );
            })
          )}
        </nav>
      )}
    </aside>
  );
}

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="9" r="6" />
      <line x1="13.5" y1="13.5" x2="18" y2="18" />
    </svg>
  );
}

function XSmallIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current stroke-2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`fill-none stroke-current stroke-2 ${className}`} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 13.5A7.5 7.5 0 1 1 6.5 3a5.5 5.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="16" height="11" rx="2" />
      <line x1="7" y1="17" x2="13" y2="17" />
      <line x1="10" y1="14" x2="10" y2="17" />
    </svg>
  );
}

function EmptyChatIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12 text-gray-300 dark:text-zinc-700 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H16l-8 6V12z" />
      <line x1="16" y1="20" x2="32" y2="20" />
      <line x1="16" y1="27" x2="26" y2="27" />
    </svg>
  );
}

function NoResultsIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-10 h-10 text-gray-300 dark:text-zinc-700 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="22" cy="22" r="14" />
      <line x1="32" y1="32" x2="44" y2="44" />
      <line x1="17" y1="22" x2="27" y2="22" />
    </svg>
  );
}
