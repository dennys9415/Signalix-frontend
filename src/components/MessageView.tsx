'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatDTO, MessageDTO } from '@signalix/contracts';
import { useChatStore, type TempMessage, type StoredMessage } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { useSidebar } from '../lib/sidebar-context';
import { Avatar } from './Avatar';
import { PresenceIndicator } from './PresenceIndicator';
import { StatusIcon } from './StatusIcon';
import { MessageInput } from './MessageInput';
import { ContactProfileModal } from './ContactProfileModal';

const EMPTY_MESSAGES: StoredMessage[] = [];

interface Props {
  chat: ChatDTO;
}

function getOtherParticipant(chat: ChatDTO, currentUserId: string) {
  return chat.participants.find((p) => p.userId !== currentUserId);
}

/* ─── Message bubble ────────────────────────────────────────────────────── */

interface BubbleProps {
  m: MessageDTO | TempMessage;
  index: number;
  currentUserId: string;
  chatId: string;
}

function MessageBubble({ m, index, currentUserId, chatId }: BubbleProps) {
  const deleteMessageForMe = useChatStore((s) => s.deleteMessageForMe);
  const [deleting, setDeleting] = useState(false);

  const isMine = 'senderId' in m ? m.senderId === currentUserId : true;
  const text = 'ciphertext' in m ? m.ciphertext : '';
  const time =
    'createdAt' in m
      ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
  const isPending = 'pending' in m && m.pending;
  const state = 'state' in m ? m.state : 'created';
  const messageId = 'id' in m ? m.id : null;

  async function handleDelete() {
    if (!messageId || deleting) return;
    setDeleting(true);
    try {
      await deleteMessageForMe(chatId, messageId);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className={`group flex items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {/* Delete — left for received */}
      {!isMine && messageId && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete for me"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 disabled:opacity-30 p-1 flex-shrink-0 mb-1"
        >
          <TrashIcon />
        </button>
      )}

      <div
        className={`max-w-xs sm:max-w-sm lg:max-w-md xl:max-w-lg rounded-2xl px-3.5 py-2 ${
          isMine
            ? 'bg-indigo-600 text-white rounded-br-md'
            : 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 rounded-bl-md'
        } ${isPending || deleting ? 'opacity-60' : ''}`}
      >
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{text}</p>
        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[11px] ${isMine ? 'text-indigo-200' : 'text-gray-400 dark:text-zinc-500'}`}>
            {time}
          </span>
          {isMine && <StatusIcon state={state} />}
        </div>
      </div>

      {/* Delete — right for sent */}
      {isMine && messageId && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete for me"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 disabled:opacity-30 p-1 flex-shrink-0 mb-1"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

/* ─── Main view ─────────────────────────────────────────────────────────── */

export function MessageView({ chat }: Props) {
  const session = useAuthStore((s) => s.session);
  const messages = useChatStore((s) => s.messages[chat.id] ?? EMPTY_MESSAGES);
  const presence = useChatStore((s) => s.presence);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const markRead = useChatStore((s) => s.markRead);
  const router = useRouter();
  const { setOpen } = useSidebar();

  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const setActiveChatId = useChatStore((s) => s.setActiveChatId);
  const clearUnread = useChatStore((s) => s.clearUnread);

  const currentUserId = session?.userId ?? '';
  const other = getOtherParticipant(chat, currentUserId);
  const otherName = other?.user?.displayName ?? other?.user?.username ?? 'Unknown';
  const otherUsername = other?.user?.username ?? '';
  const otherSeed = other?.userId ?? chat.id;
  const isOnline = other ? (presence[other.userId] ?? 'offline') === 'online' : false;

  // Register this chat as active; clear any unread count; deregister on unmount.
  useEffect(() => {
    setActiveChatId(chat.id);
    clearUnread(chat.id);
    return () => setActiveChatId(null);
  }, [chat.id, setActiveChatId, clearUnread]);

  useEffect(() => {
    loadMessages(chat.id);
  }, [chat.id, loadMessages]);

  useEffect(() => {
    const lastUnread = [...messages]
      .reverse()
      .find(
        (m): m is MessageDTO =>
          'id' in m && m.senderId !== currentUserId && m.state !== 'read',
      );
    if (lastUnread) markRead(chat.id, lastUnread.id);
  }, [messages, currentUserId, chat.id, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  function handleSend(text: string) {
    sendMessage({ chatId: chat.id, ciphertext: text });
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0">
        {/* Mobile back button */}
        <button
          onClick={() => { setOpen(true); router.push('/chats'); }}
          className="md:hidden flex items-center justify-center w-8 h-8 -ml-1 rounded-full text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Back to chats"
        >
          <BackArrowIcon />
        </button>

        <Avatar name={otherName} seed={otherSeed} size="sm" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">{otherName}</p>
          <div className="flex items-center gap-1.5">
            <PresenceIndicator online={isOnline} size="sm" />
            <p className={`text-xs font-medium ${isOnline ? 'text-emerald-500' : 'text-gray-400 dark:text-zinc-500'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>

        {/* ⋮ Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Chat options"
          >
            <DotsVerticalIcon />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl shadow-xl bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 z-50 overflow-hidden py-1">
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors text-left"
                onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
              >
                <UserIcon />
                <span>View Profile</span>
              </button>
              <div className="my-1 border-t border-gray-100 dark:border-zinc-700/50" />
              <button
                disabled
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 dark:text-zinc-500 cursor-not-allowed text-left"
                title="Coming soon"
              >
                <TrashOutlineIcon />
                <span>Delete Chat</span>
                <span className="ml-auto text-[10px] text-gray-300 dark:text-zinc-600">soon</span>
              </button>
              <button
                disabled
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 dark:text-zinc-500 cursor-not-allowed text-left"
                title="Coming soon"
              >
                <BlockIcon />
                <span>Block User</span>
                <span className="ml-auto text-[10px] text-gray-300 dark:text-zinc-600">soon</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5 bg-gray-50 dark:bg-zinc-950">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center select-none">
            <Avatar name={otherName} seed={otherSeed} size="xl" />
            <div>
              <p className="text-base font-semibold text-gray-800 dark:text-zinc-200">{otherName}</p>
              {otherUsername && (
                <p className="text-sm text-gray-400 dark:text-zinc-500">@{otherUsername}</p>
              )}
            </div>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1">
              Start the conversation.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble
            key={'id' in m ? m.id : `tmp-${i}`}
            m={m}
            index={i}
            currentUserId={currentUserId}
            chatId={chat.id}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <MessageInput onSend={handleSend} />

      {profileOpen && other && (
        <ContactProfileModal
          userId={other.userId}
          displayName={otherName}
          username={otherUsername}
          isOnline={isOnline}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
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

function DotsVerticalIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-current" aria-hidden="true">
      <circle cx="10" cy="4" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="10" cy="16" r="1.5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="7" r="3.5" />
      <path d="M2.5 18a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd" />
    </svg>
  );
}

function TrashOutlineIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h12M8 6V4h4v2M16 6l-1 11H5L4 6" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="12" y1="10" x2="12" y2="14" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" />
      <line x1="4.7" y1="4.7" x2="15.3" y2="15.3" />
    </svg>
  );
}
