'use client';

import { useEffect, useRef } from 'react';
import type { ChatDTO, MessageDTO } from '@signalix/contracts';
import { useChatStore, type TempMessage } from '../store/chat.store';
import { useAuthStore } from '../store/auth.store';
import { PresenceIndicator } from './PresenceIndicator';
import { StatusIcon } from './StatusIcon';
import { MessageInput } from './MessageInput';

interface Props {
  chat: ChatDTO;
}

function getOtherParticipant(chat: ChatDTO, currentUserId: string) {
  return chat.participants.find((p) => p.userId !== currentUserId);
}

export function MessageView({ chat }: Props) {
  const session = useAuthStore((s) => s.session);
  const messages = useChatStore((s) => s.messages[chat.id] ?? []);
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
        {messages.map((m, i) => {
          const isMine =
            'senderId' in m ? m.senderId === currentUserId : true;
          const key = 'id' in m ? m.id : `tmp-${i}`;
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

          return (
            <div
              key={key}
              className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md xl:max-w-lg rounded-2xl px-3 py-2 text-sm ${
                  isMine
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                } ${isPending ? 'opacity-60' : ''}`}
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
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <MessageInput onSend={handleSend} />
    </div>
  );
}
