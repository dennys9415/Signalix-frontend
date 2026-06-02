'use client';

import { useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { PublicUserDTO } from '@signalix/contracts';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { lookupUser } from '../lib/api-client';
import { ChatItem } from './ChatItem';
import { PresenceIndicator } from './PresenceIndicator';

export function ChatSidebar() {
  const params = useParams();
  const router = useRouter();
  const activeChatId = typeof params?.chatId === 'string' ? params.chatId : null;

  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const chats = useChatStore((s) => s.chats);
  const presence = useChatStore((s) => s.presence);
  const setPendingRecipient = useChatStore((s) => s.setPendingRecipient);

  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<PublicUserDTO | null | 'not-found'>(null);
  const [searching, startSearch] = useTransition();

  const currentUserId = session?.userId ?? '';

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    startSearch(async () => {
      const { user } = await lookupUser(query.trim());
      setSearchResult(user ?? 'not-found');
    });
  }

  function startNewChat(user: PublicUserDTO) {
    // Check if we already have a chat with this user
    const existing = chats.find((c) =>
      c.participants.some((p) => p.userId === user.id),
    );
    if (existing) {
      router.push(`/chats/${existing.id}`);
    } else {
      setPendingRecipient(user);
      router.push('/chats');
    }
    setQuery('');
    setSearchResult(null);
  }

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-800">
        <span className="font-semibold text-indigo-400">Signalix</span>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Logout
        </button>
      </div>

      {/* User search */}
      <form onSubmit={handleSearch} className="p-3 border-b border-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchResult(null);
            }}
            placeholder="Find user…"
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

        {searchResult === 'not-found' && (
          <p className="mt-2 text-xs text-gray-500">No user found.</p>
        )}
        {searchResult && searchResult !== 'not-found' && (
          <button
            type="button"
            onClick={() => startNewChat(searchResult)}
            className="mt-2 w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-semibold uppercase flex-shrink-0">
              {(searchResult.displayName ?? searchResult.username).charAt(0)}
            </div>
            <span className="truncate">{searchResult.displayName ?? searchResult.username}</span>
            <PresenceIndicator
              online={(presence[searchResult.id] ?? 'offline') === 'online'}
              className="ml-auto flex-shrink-0"
            />
          </button>
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
