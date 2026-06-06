'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChatType, type ChatDTO, type PublicUserDTO } from '@signalix/contracts';
import { useChatStore, DRAFT_PREFIX } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { getMe, searchUsers } from '../lib/api-client';
import { useSidebar } from '../lib/sidebar-context';
import { ChatItem } from './ChatItem';
import { Avatar } from './Avatar';
import { PresenceIndicator } from './PresenceIndicator';
import { GroupCreateModal } from './GroupCreateModal';

export function ChatSidebar() {
  const router = useRouter();
  const { setOpen } = useSidebar();

  const session = useAuthStore((s) => s.session);
  const chats = useChatStore((s) => s.chats);
  const messages = useChatStore((s) => s.messages);
  const presence = useChatStore((s) => s.presence);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const setActiveChatId = useChatStore((s) => s.setActiveChatId);
  const openDraftChat = useChatStore((s) => s.openDraftChat);

  const [currentUser, setCurrentUser] = useState<{ id: string; displayName?: string; username: string; avatarUrl?: string | null } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUserDTO[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, startSearch] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  const currentUserId = session?.userId ?? '';

  useEffect(() => {
    if (!session) return;
    getMe().then(({ user }) => setCurrentUser(user)).catch(() => {});
  }, [session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (!val.trim()) { clearSearch(); return; }
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
    // Only match real direct chats (not drafts) — group chats excluded by type check.
    const existing = chats.find(
      (c) => c.type === ChatType.DIRECT && !c.id.startsWith(DRAFT_PREFIX) && c.participants.some((p) => p.userId === user.id),
    );
    if (existing) {
      router.push(`/chats/${existing.id}`);
    } else {
      openDraftChat(user);
      router.push('/chats');
    }
    clearSearch();
    setOpen(false);
  }

  function handleChatSelect() {
    setOpen(false);
  }

  function handleDraftClick(chat: ChatDTO) {
    setActiveChatId(chat.id);
    router.push('/chats');
    setOpen(false);
  }

  const isSearching = query.trim().length > 0;

  return (
    <aside className="flex flex-col h-full min-h-0">

      {/* ── User profile header — mobile only ── */}
      {currentUser && (
        <Link
          href="/settings/profile"
          className="flex md:hidden items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
        >
          <div className="relative">
            <Avatar name={currentUser.displayName ?? currentUser.username} seed={currentUser.id} avatarUrl={currentUser.avatarUrl} size="md" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-[#1c1c24]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold truncate text-[#1d1d1f] dark:text-[#f5f5f7]">
              {currentUser.displayName ?? currentUser.username}
            </p>
            <p className="text-[12px] text-[#8e8e93] truncate">@{currentUser.username}</p>
          </div>
          <ChevronRightIcon />
        </Link>
      )}

      {/* ── Sidebar header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <h2 className="text-[17px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7] tracking-tight">Messages</h2>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setGroupModalOpen(true)}
            title="New group"
            className="w-8 h-8 flex items-center justify-center rounded-xl text-[#007aff] dark:text-[#0a84ff] hover:bg-[#007aff]/[0.08] dark:hover:bg-[#0a84ff]/[0.10] transition-all duration-150"
          >
            <GroupIcon />
          </button>
          <button
            onClick={() => { setQuery(''); searchRef.current?.focus(); }}
            title="New conversation"
            className="w-8 h-8 flex items-center justify-center rounded-xl text-[#007aff] dark:text-[#0a84ff] hover:bg-[#007aff]/[0.08] dark:hover:bg-[#0a84ff]/[0.10] transition-all duration-150"
          >
            <ComposeIcon />
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 mb-2 flex-shrink-0">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aeaeb2] dark:text-[#636375] pointer-events-none">
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Search"
            className="w-full rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.06] dark:border-white/[0.07] pl-9 pr-9 py-2 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] dark:placeholder-[#636375] focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 dark:focus:ring-[#0a84ff]/15 transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#aeaeb2] hover:text-[#6e6e73] dark:hover:text-[#8e8e93] transition-colors"
            >
              <XSmallIcon />
            </button>
          )}
        </div>
      </div>

      {/* ── Search results ── */}
      {isSearching && (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 space-y-0.5">
          {searching && (
            <p className="text-[12px] text-[#aeaeb2] px-2 py-2">Searching…</p>
          )}
          {!searching && searched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <NoResultsIcon />
              <p className="text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">No users found</p>
              <p className="text-[12px] text-[#8e8e93]">Try a different username</p>
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
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors text-left"
              >
                <div className="relative flex-shrink-0">
                  <Avatar name={name} seed={user.id} avatarUrl={user.avatarUrl} size="md" />
                  {isOnline && (
                    <PresenceIndicator
                      online
                      className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-[#1c1c24]"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium truncate text-[#1d1d1f] dark:text-[#f5f5f7]">{name}</p>
                  <p className="text-[12px] text-[#8e8e93] truncate">@{user.username}</p>
                </div>
                {isOnline && (
                  <span className="text-[11px] font-medium text-emerald-500 flex-shrink-0">Online</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Chat list ── */}
      {!isSearching && (
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 space-y-0.5 pb-3">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4 py-16">
              <EmptyChatIcon />
              <div>
                <p className="text-[14px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">No conversations yet</p>
                <p className="text-[12px] text-[#8e8e93] mt-1">
                  Search for a username to start chatting.
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
                    unreadCount={unreadCounts[chat.id] ?? 0}
                    onDraftClick={handleDraftClick}
                  />
                </div>
              );
            })
          )}
        </nav>
      )}

      {groupModalOpen && (
        <GroupCreateModal
          currentUserId={currentUserId}
          onCreated={(chatId) => {
            setGroupModalOpen(false);
            setOpen(false);
            router.push(`/chats/${chatId}`);
          }}
          onClose={() => setGroupModalOpen(false)}
        />
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

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current stroke-[2.5] text-[#c7c7cc] dark:text-[#3c3c44]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4.5 h-4.5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="3" />
      <path d="M1 17a6 6 0 0 1 12 0" />
      <circle cx="15" cy="7" r="2.5" />
      <path d="M13 17h6a5 5 0 0 0-4-4.9" />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4.5 h-4.5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Speech bubble (Lucide MessageSquarePlus path scaled 24→20) */}
      <path d="M17.5 12.5a1.5 1.5 0 0 1-1.5 1.5H6l-3 3V4a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5z" />
      {/* Plus sign */}
      <path d="M10 6v5M7.5 8.5h5" />
    </svg>
  );
}

function EmptyChatIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12 text-[#c7c7cc] dark:text-[#3c3c44] fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H16l-8 6V12z" />
      <line x1="16" y1="20" x2="32" y2="20" />
      <line x1="16" y1="27" x2="26" y2="27" />
    </svg>
  );
}

function NoResultsIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-10 h-10 text-[#c7c7cc] dark:text-[#3c3c44] fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="22" cy="22" r="14" />
      <line x1="32" y1="32" x2="44" y2="44" />
      <line x1="17" y1="22" x2="27" y2="22" />
    </svg>
  );
}
