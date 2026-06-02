'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatDTO, MessageDTO } from '@signalix/contracts';
import { useChatStore, type TempMessage, type StoredMessage } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { PresenceIndicator } from './PresenceIndicator';
import { StatusIcon } from './StatusIcon';
import { MessageInput } from './MessageInput';

// Stable empty fallback — must be module-level so useSyncExternalStore sees the same
// reference on every call when messages[chatId] is undefined.
const EMPTY_MESSAGES: StoredMessage[] = [];

interface Props {
  chat: ChatDTO;
}

function getOtherParticipant(chat: ChatDTO, currentUserId: string) {
  return chat.participants.find((p) => p.userId !== currentUserId);
}

interface MessageBubbleProps {
  m: MessageDTO | TempMessage;
  index: number;
  currentUserId: string;
  chatId: string;
}

function MessageBubble({ m, index, currentUserId, chatId }: MessageBubbleProps) {
  const deleteMessageForMe = useChatStore((s) => s.deleteMessageForMe);
  const [deleting, setDeleting] = useState(false);

  const isMine = 'senderId' in m ? m.senderId === currentUserId : true;
  const key = 'id' in m ? m.id : `tmp-${index}`;
  const text = 'ciphertext' in m ? m.ciphertext : '';
  const time =
    'createdAt' in m
      ? new Date(m.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
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
      {/* Delete button — left side for mine, right side for theirs */}
      {!isMine && messageId && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete for me"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400 disabled:opacity-30 p-0.5 flex-shrink-0"
        >
          <TrashIcon />
        </button>
      )}

      <div
        className={`max-w-xs lg:max-w-md xl:max-w-lg rounded-2xl px-3 py-2 text-sm ${
          isMine
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-800 text-gray-100 rounded-bl-sm'
        } ${isPending || deleting ? 'opacity-60' : ''}`}
      >
        <p className="break-words">{text}</p>
        <div
          className={`flex items-center gap-1 mt-0.5 ${
            isMine ? 'justify-end' : 'justify-start'
          }`}
        >
          <span className="text-xs opacity-60">{time}</span>
          {isMine && <StatusIcon state={state} />}
        </div>
      </div>

      {isMine && messageId && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete for me"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400 disabled:opacity-30 p-0.5 flex-shrink-0"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path
        fillRule="evenodd"
        d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function MessageView({ chat }: Props) {
  const session = useAuthStore((s) => s.session);
  const messages = useChatStore((s) => s.messages[chat.id] ?? EMPTY_MESSAGES);
  const presence = useChatStore((s) => s.presence);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const markRead = useChatStore((s) => s.markRead);

  const currentUserId = session?.userId ?? '';
  const other = getOtherParticipant(chat, currentUserId);
  const otherName = other?.user?.displayName ?? other?.user?.username ?? 'Unknown';
  const isOnline = other ? (presence[other.userId] ?? 'offline') === 'online' : false;

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages(chat.id);
  }, [chat.id, loadMessages]);

  // Mark last unread message from others as read
  useEffect(() => {
    const lastUnread = [...messages]
      .reverse()
      .find(
        (m): m is MessageDTO =>
          'id' in m && m.senderId !== currentUserId && m.state !== 'read',
      );
    if (lastUnread) {
      markRead(chat.id, lastUnread.id);
    }
  }, [messages, currentUserId, chat.id, markRead]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function handleSend(text: string) {
    sendMessage({ chatId: chat.id, ciphertext: text });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-semibold uppercase">
            {otherName.charAt(0)}
          </div>
          <PresenceIndicator
            online={isOnline}
            className="absolute -bottom-0.5 -right-0.5 ring-2 ring-gray-900"
          />
        </div>
        <div>
          <p className="text-sm font-medium">{otherName}</p>
          <p className="text-xs text-gray-500">{isOnline ? 'Online' : 'Offline'}</p>
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
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
    </div>
  );
}
