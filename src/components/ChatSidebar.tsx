'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChatType, type ChatDTO, type MessageSearchResultDTO, type PublicUserDTO } from '@signalix/contracts';
import { useChatStore, DRAFT_PREFIX } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { getMe, searchUsers, searchMessages } from '../lib/api-client';
import { useSidebar } from '../lib/sidebar-context';
import { formatChatTime } from '../lib/avatar';
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
  const [messageResults, setMessageResults] = useState<MessageSearchResultDTO[]>([]);
  const [messageNextCursor, setMessageNextCursor] = useState<string | undefined>(undefined);
  const [messageHasMore, setMessageHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searching, startSearch] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  // Tracks the query we issued the most recent request for. Stale responses
  // (user typed something newer mid-flight) are discarded by comparing.
  const activeQueryRef = useRef<string>('');
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
    const q = val.trim();
    activeQueryRef.current = q;
    // Reset message paging on every new query — the cursor only makes
    // sense relative to one specific search term.
    setMessageNextCursor(undefined);
    setMessageHasMore(false);
    startSearch(async () => {
      // Fan out user + message search in parallel. Message search requires
      // ≥2 chars (API DTO enforces); for shorter queries we skip it so the
      // people-search UX still works on a single character.
      const emptyPage = { results: [] as MessageSearchResultDTO[], pagination: { hasMore: false, nextCursor: undefined as string | undefined } };
      const [users, msgPage] = await Promise.all([
        searchUsers(q).then((r) => r.users).catch(() => [] as PublicUserDTO[]),
        q.length >= 2
          ? searchMessages(q, { limit: 12 }).catch(() => emptyPage)
          : Promise.resolve(emptyPage),
      ]);
      // Discard if the user kept typing while we were waiting.
      if (activeQueryRef.current !== q) return;
      setResults(users);
      setMessageResults(msgPage.results);
      setMessageHasMore(msgPage.pagination.hasMore);
      setMessageNextCursor(msgPage.pagination.nextCursor ?? undefined);
      setSearched(true);
      // Reset the scroll container to top after a new search.
      if (resultsScrollRef.current) resultsScrollRef.current.scrollTop = 0;
    });
  }

  function clearSearch() {
    activeQueryRef.current = '';
    setQuery('');
    setResults([]);
    setMessageResults([]);
    setMessageNextCursor(undefined);
    setMessageHasMore(false);
    setLoadingMore(false);
    setSearched(false);
  }

  async function loadMoreMessageResults() {
    if (loadingMore || !messageHasMore || !messageNextCursor) return;
    const q = activeQueryRef.current;
    if (!q || q.length < 2) return;
    setLoadingMore(true);
    try {
      const page = await searchMessages(q, { limit: 12, cursor: messageNextCursor });
      // Drop the page if the user moved on to a different query mid-flight.
      if (activeQueryRef.current !== q) return;
      setMessageResults((prev) => [...prev, ...page.results]);
      setMessageHasMore(page.pagination.hasMore);
      setMessageNextCursor(page.pagination.nextCursor);
    } catch {
      // Best-effort; leave existing state intact.
    } finally {
      setLoadingMore(false);
    }
  }

  function handleResultsScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!messageHasMore || loadingMore) return;
    const el = e.currentTarget;
    // Fire when the user gets within 120 px of the bottom; gives the next
    // page time to render before they actually reach the edge.
    if (el.scrollHeight - (el.scrollTop + el.clientHeight) < 120) {
      void loadMoreMessageResults();
    }
  }

  function openMessageResult(r: MessageSearchResultDTO) {
    // Pass the target messageId via query string. MessageView reads `?m` and
    // scrolls / highlights once the messages page has loaded.
    router.push(`/chats/${r.chatId}?m=${encodeURIComponent(r.messageId)}`);
    clearSearch();
    setOpen(false);
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
          className="flex md:hidden items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0 hover:bg-white/40 dark:hover:bg-white/[0.04] transition-colors"
        >
          <div className="relative">
            <Avatar name={currentUser.displayName ?? currentUser.username} seed={currentUser.id} avatarUrl={currentUser.avatarUrl} size="md" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white/80 dark:ring-[#1c1c24]/80" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold truncate text-[#1d1d1f] dark:text-[#f5f5f7]">
              {currentUser.displayName ?? currentUser.username}
            </p>
            <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] truncate">@{currentUser.username}</p>
          </div>
          <ChevronRightIcon />
        </Link>
      )}

      {/* ── Sidebar header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <h2 className="text-[17px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7] tracking-tight">Messages</h2>
        <div className="flex items-center gap-0.5">
          {/* Match IconRail spec exactly: 40×40 hit area, rounded-2xl, neutral
              gray glyph, hover gives glass background + full-contrast color. */}
          <button
            onClick={() => setGroupModalOpen(true)}
            title="New group"
            aria-label="New group"
            className="w-10 h-10 flex items-center justify-center rounded-2xl text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/40 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-all duration-200 hover:scale-[1.04] active:scale-[0.98]"
          >
            <GroupIcon />
          </button>
          <button
            onClick={() => { setQuery(''); searchRef.current?.focus(); }}
            title="New conversation"
            aria-label="New conversation"
            className="w-10 h-10 flex items-center justify-center rounded-2xl text-[#8e8e93] dark:text-[#9a9aa3] hover:bg-white/40 dark:hover:bg-white/[0.06] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-all duration-200 hover:scale-[1.04] active:scale-[0.98]"
          >
            <ComposeIcon />
          </button>
        </div>
      </div>

      {/* ── Search — Apple-style pill ── */}
      <div className="px-3 mb-2 flex-shrink-0">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8e8e93] dark:text-[#9a9aa3] pointer-events-none">
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Search"
            className="w-full rounded-full bg-white/45 dark:bg-white/[0.06] backdrop-blur-xl border border-white/60 dark:border-white/[0.06] pl-9 pr-9 py-2 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#8e8e93] dark:placeholder-[#9a9aa3] focus:outline-none focus:bg-white/70 dark:focus:bg-white/[0.08] focus:border-white/80 dark:focus:border-white/[0.10] transition-all duration-200"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8e8e93] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-colors"
            >
              <XSmallIcon />
            </button>
          )}
        </div>
      </div>

      {/* ── Search results ── */}
      {isSearching && (
        <div
          ref={resultsScrollRef}
          onScroll={handleResultsScroll}
          className="flex-1 min-h-0 overflow-y-auto px-3 space-y-0.5"
        >
          {searching && (
            <p className="text-[12px] text-[#aeaeb2] px-2 py-2">Searching…</p>
          )}
          {!searching && searched && results.length === 0 && messageResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <NoResultsIcon />
              <p className="text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">No results</p>
              <p className="text-[12px] text-[#8e8e93]">Try a different username or phrase</p>
            </div>
          )}

          {results.length > 0 && (
            <>
              <p className="px-2 pt-2 pb-1 text-[11px] font-semibold text-[#8e8e93] dark:text-[#9a9aa3] uppercase tracking-wide">People</p>
              {results.map((user) => {
                const name = user.displayName ?? user.username;
                const isOnline = (presence[user.id] ?? 'offline') === 'online';
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => startNewChat(user)}
                    className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/50 dark:hover:bg-white/[0.05] transition-all duration-200 hover:scale-[1.005] active:scale-[0.99] text-left"
                  >
                    <div className="relative flex-shrink-0">
                      <Avatar name={name} seed={user.id} avatarUrl={user.avatarUrl} size="md" />
                      {isOnline && (
                        <PresenceIndicator
                          online
                          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white/80 dark:ring-[#1c1c24]/80"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium truncate text-[#1d1d1f] dark:text-[#f5f5f7]">{name}</p>
                      <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] truncate">@{user.username}</p>
                    </div>
                    {isOnline && (
                      <span className="text-[11px] font-medium text-emerald-500 flex-shrink-0">Online</span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {messageResults.length > 0 && (
            <>
              <p className={`px-2 ${results.length > 0 ? 'pt-3' : 'pt-2'} pb-1 text-[11px] font-semibold text-[#8e8e93] dark:text-[#9a9aa3] uppercase tracking-wide`}>Messages</p>
              {messageResults.map((r) => (
                <button
                  key={r.messageId}
                  type="button"
                  onClick={() => openMessageResult(r)}
                  className="w-full flex items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/50 dark:hover:bg-white/[0.05] transition-all duration-200 active:scale-[0.99] text-left"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Avatar
                      name={r.chatLabel || 'Chat'}
                      seed={r.chatId}
                      avatarUrl={r.chatAvatarUrl}
                      size="md"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[14px] font-semibold truncate text-[#1d1d1f] dark:text-[#f5f5f7]">{r.chatLabel || 'Chat'}</p>
                      <span className="text-[11px] text-[#8e8e93] dark:text-[#9a9aa3] flex-shrink-0 tabular-nums ml-auto">
                        {formatChatTime(r.createdAt)}
                      </span>
                    </div>
                    {r.chatType === ChatType.GROUP && (
                      <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] truncate">
                        {r.senderName}
                      </p>
                    )}
                    <p className="text-[13px] text-[#1d1d1f] dark:text-[#d1d1d6] mt-0.5 line-clamp-2 [overflow-wrap:anywhere]">
                      {renderSnippet(r.ciphertext, query.trim())}
                    </p>
                  </div>
                </button>
              ))}
              {loadingMore && (
                <p className="text-[11px] text-[#8e8e93] dark:text-[#9a9aa3] px-2 py-3 text-center">Loading more…</p>
              )}
              {!loadingMore && messageHasMore && (
                <button
                  type="button"
                  onClick={() => void loadMoreMessageResults()}
                  className="w-full text-[12px] text-[#007aff] dark:text-[#0a84ff] font-medium px-2 py-3 hover:opacity-80 transition-opacity"
                >
                  Load more
                </button>
              )}
            </>
          )}
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
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="3" />
      <path d="M1 17a6 6 0 0 1 12 0" />
      <circle cx="15" cy="7" r="2.5" />
      <path d="M13 17h6a5 5 0 0 0-4-4.9" />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Speech bubble (Lucide MessageSquarePlus path scaled 24→20) */}
      <path d="M17.5 12.5a1.5 1.5 0 0 1-1.5 1.5H6l-3 3V4a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5z" />
      {/* Plus sign */}
      <path d="M10 6v5M7.5 8.5h5" />
    </svg>
  );
}

/**
 * Returns the message snippet with the matched substring wrapped in a
 * highlight span. When the match sits deep into a long body, we window
 * the snippet around the match instead of always slicing from the start.
 */
function renderSnippet(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const idx = lower.indexOf(ql);
  if (idx === -1) {
    const cut = text.length > 160 ? `${text.slice(0, 160)}…` : text;
    return cut;
  }
  let start = 0;
  let end = text.length;
  const WINDOW = 160;
  if (text.length > WINDOW && idx > 60) {
    start = Math.max(0, idx - 40);
    end = Math.min(text.length, start + WINDOW);
  } else if (text.length > WINDOW) {
    end = WINDOW;
  }
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const before = text.slice(start, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length, end);
  return (
    <>
      {prefix}{before}
      <mark className="bg-[#007aff]/20 dark:bg-[#0a84ff]/25 text-[#1d1d1f] dark:text-[#f5f5f7] rounded-[3px] px-0.5">{match}</mark>
      {after}{suffix}
    </>
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
