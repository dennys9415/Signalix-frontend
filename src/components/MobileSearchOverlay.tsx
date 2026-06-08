'use client';

// v0.13.0 — full-screen mobile search overlay.
//
// On desktop the sidebar's search bar handles global search inline,
// but on a phone the sidebar competes with the chat list for the same
// viewport. This component fills the screen, takes over focus, and
// dismisses on result tap (which routes to /chats/:id?m=:msg, the
// same scroll+highlight path MessageView already implements).
//
// Reuses the same hybrid (server + local) search pipeline as
// ChatSidebar so encrypted bodies are findable. No new state in the
// store — the overlay is self-contained.

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatDTO, MessageSearchResultDTO, PublicUserDTO } from '@signalix/contracts';
import { ChatType } from '@signalix/contracts';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { useSidebar } from '../lib/sidebar-context';
import { searchMessages, searchUsers } from '../lib/api-client';
import { mergeSearchResults, searchLocalMessages } from '../lib/local-search';
import { Avatar } from './Avatar';
import { formatChatTime } from '../lib/avatar';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MobileSearchOverlay({ open, onClose }: Props) {
  const router = useRouter();
  const { setOpen: setSidebarOpen } = useSidebar();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const session = useAuthStore((s) => s.session);
  const chats = useChatStore((s) => s.chats);
  const messages = useChatStore((s) => s.messages);

  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<PublicUserDTO[]>([]);
  const [msgs, setMsgs] = useState<MessageSearchResultDTO[]>([]);
  const [searched, setSearched] = useState(false);
  const [_, startSearch] = useTransition();
  const activeQueryRef = useRef('');

  useEffect(() => {
    if (open) {
      // Autofocus the input after the overlay paints.
      requestAnimationFrame(() => inputRef.current?.focus());
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    // Reset state when the overlay closes so reopening starts fresh.
    setQuery('');
    setUsers([]);
    setMsgs([]);
    setSearched(false);
    activeQueryRef.current = '';
    return undefined;
  }, [open, onClose]);

  function handleChange(val: string) {
    setQuery(val);
    const q = val.trim();
    activeQueryRef.current = q;
    if (!q) {
      setUsers([]);
      setMsgs([]);
      setSearched(false);
      return;
    }
    startSearch(async () => {
      const emptyPage = { results: [] as MessageSearchResultDTO[], pagination: { hasMore: false, nextCursor: undefined as string | undefined } };
      const [u, p] = await Promise.all([
        searchUsers(q).then((r) => r.users).catch(() => [] as PublicUserDTO[]),
        q.length >= 2
          ? searchMessages(q, { limit: 16 }).catch(() => emptyPage)
          : Promise.resolve(emptyPage),
      ]);
      if (activeQueryRef.current !== q) return;
      const localHits = q.length >= 2
        ? searchLocalMessages(q, {
            chats,
            messagesByChat: messages,
            currentUserId: session?.userId ?? '',
          }, { limit: 40 })
        : [];
      setUsers(u);
      setMsgs(mergeSearchResults(p.results, localHits));
      setSearched(true);
    });
  }

  function openMessageResult(r: MessageSearchResultDTO) {
    setSidebarOpen(false);
    onClose();
    router.push(`/chats/${r.chatId}?m=${encodeURIComponent(r.messageId)}`);
  }

  function openUserResult(u: PublicUserDTO) {
    setSidebarOpen(false);
    onClose();
    router.push(`/chats/draft:${u.id}`);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-white dark:bg-[#15151b] flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-3 border-b border-black/[0.06] dark:border-white/[0.05]" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
        <button
          onClick={onClose}
          aria-label="Close search"
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-2xl text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors"
        >
          <BackIcon />
        </button>
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Search messages, people, groups…"
            className="w-full rounded-2xl bg-black/[0.05] dark:bg-white/[0.06] px-4 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder:text-[#8e8e93] dark:placeholder:text-[#6e6e75] focus:outline-none focus:ring-2 focus:ring-[#007aff]/40"
          />
          {query && (
            <button
              onClick={() => handleChange('')}
              aria-label="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-[#8e8e93] dark:text-[#6e6e75] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
            >
              <ClearIcon />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!query && (
          <p className="text-center text-[13px] text-[#8e8e93] dark:text-[#8e8e93] mt-12">
            Search across messages, people, and groups.
          </p>
        )}

        {query && searched && users.length === 0 && msgs.length === 0 && (
          <p className="text-center text-[13px] text-[#8e8e93] dark:text-[#8e8e93] mt-12">
            No results.
          </p>
        )}

        {users.length > 0 && (
          <section className="px-3 pt-3">
            <p className="text-[11px] uppercase tracking-wide text-[#8e8e93] dark:text-[#6e6e75] mb-2 px-1">People</p>
            <ul className="space-y-0.5">
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => openUserResult(u)}
                    className="w-full flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <Avatar name={u.displayName ?? u.username} seed={u.id} avatarUrl={u.avatarUrl ?? undefined} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{u.displayName ?? u.username}</p>
                      <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] truncate">@{u.username}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {msgs.length > 0 && (
          <section className="px-3 pt-3 pb-6">
            <p className="text-[11px] uppercase tracking-wide text-[#8e8e93] dark:text-[#6e6e75] mb-2 px-1">Messages</p>
            <ul className="space-y-0.5">
              {msgs.map((r) => (
                <li key={r.messageId}>
                  <button
                    onClick={() => openMessageResult(r)}
                    className="w-full flex items-start gap-3 rounded-2xl px-2 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <Avatar name={r.chatLabel || r.senderName} seed={r.chatId} avatarUrl={r.chatAvatarUrl ?? undefined} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[13.5px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                          {r.chatType === ChatType.GROUP ? r.chatLabel : r.chatLabel}
                        </p>
                        <span className="text-[11px] text-[#8e8e93] dark:text-[#9a9aa3] flex-shrink-0">
                          {formatChatTime(r.createdAt)}
                        </span>
                      </div>
                      <p className="text-[12px] text-[#8e8e93] dark:text-[#9a9aa3] truncate">
                        <span className="font-medium text-[#5a5a64] dark:text-[#a5a5b0]">{r.senderName}: </span>
                        {r.ciphertext.slice(0, 120) || '(no preview)'}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Keep the list usable from anonymous-chat context — let the caller decide. */}
        {users.length === 0 && msgs.length === 0 && query && !searched && (
          <p className="text-center text-[13px] text-[#8e8e93] dark:text-[#8e8e93] mt-12">Searching…</p>
        )}
        {/* avoid TS6133 on chats placeholder when unused — we read it above */}
        <span className="hidden" aria-hidden>{chats.length}</span>
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15,18 9,12 15,6" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current stroke-[2]" strokeLinecap="round" aria-hidden>
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}
