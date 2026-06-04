'use client';

import { useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PublicUserDTO } from '@signalix/contracts';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { getMe, searchUsers } from '../lib/api-client';
import { ChatItem } from './ChatItem';
import { PresenceIndicator } from './PresenceIndicator';

export function ChatSidebar() {
  const params = useParams();
  const router = useRouter();
  const activeChatId = typeof params?.chatId === 'string' ? params.chatId : null;

  const session = useAuthStore((s) => s.session);
  const chats = useChatStore((s) => s.chats);
  const presence = useChatStore((s) => s.presence);
  const setPendingRecipient = useChatStore((s) => s.setPendingRecipient);

  const [currentUser, setCurrentUser] = useState<{ displayName?: string; username: string } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUserDTO[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, startSearch] = useTransition();

  const currentUserId = session?.userId ?? '';

  useEffect(() => {
    if (!session) return;
    getMe().then(({ user }) => setCurrentUser(user)).catch(() => {});
  }, [session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    startSearch(async () => {
      const { users } = await searchUsers(q);
      setResults(users);
      setSearched(true);
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
  }

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-800">
        <span className="font-semibold text-indigo-400">Signalix</span>
        <Link
          href="/settings/profile"
          className="text-gray-500 hover:text-gray-300 transition-colors"
          title="Profile & settings"
        >
          <SettingsIcon />
        </Link>
      </div>

      {/* Profile strip */}
      {currentUser && (
        <Link
          href="/settings/profile"
          className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 hover:bg-gray-800/60 transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-indigo-700 flex items-center justify-center text-sm font-bold uppercase flex-shrink-0 select-none">
            {(currentUser.displayName ?? currentUser.username).charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {currentUser.displayName ?? currentUser.username}
            </p>
            <p className="text-xs text-gray-500 truncate">@{currentUser.username}</p>
          </div>
        </Link>
      )}

      {/* User search */}
      <form onSubmit={handleSearch} className="p-3 border-b border-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) clearSearch();
            }}
            placeholder="Search users…"
            className="flex-1 min-w-0 rounded-md bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="rounded-md bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Go
          </button>
        </div>

        {/* Search results */}
        {searched && results.length === 0 && (
          <p className="mt-2 text-xs text-gray-500">No users found.</p>
        )}
        {results.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {results.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => startNewChat(user)}
                  className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-semibold uppercase flex-shrink-0">
                    {(user.displayName ?? user.username).charAt(0)}
                  </div>
                  <span className="truncate">{user.displayName ?? user.username}</span>
                  <span className="ml-1 text-xs text-gray-500 truncate">@{user.username}</span>
                  <PresenceIndicator
                    online={(presence[user.id] ?? 'offline') === 'online'}
                    className="ml-auto flex-shrink-0"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {/* Chat list */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {chats.map((chat) => (
          <ChatItem
            key={chat.id}
            chat={chat}
            currentUserId={currentUserId}
            presence={presence}
            active={chat.id === activeChatId}
          />
        ))}
        {chats.length === 0 && (
          <p className="text-xs text-gray-600 px-4 py-3">No conversations yet.</p>
        )}
      </nav>
    </aside>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
