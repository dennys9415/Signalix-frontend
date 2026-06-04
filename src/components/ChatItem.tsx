import Link from 'next/link';
import type { ChatDTO } from '@signalix/contracts';
import type { StoredMessage } from '../store/chat.store';
import { Avatar } from './Avatar';
import { PresenceIndicator } from './PresenceIndicator';
import { formatChatTime } from '../lib/avatar';

interface Props {
  chat: ChatDTO;
  currentUserId: string;
  presence: Record<string, 'online' | 'offline'>;
  active: boolean;
  lastMessage?: StoredMessage;
  unreadCount: number;
}

function getOtherParticipant(chat: ChatDTO, currentUserId: string) {
  return chat.participants.find((p) => p.userId !== currentUserId);
}

export function ChatItem({
  chat,
  currentUserId,
  presence,
  active,
  lastMessage,
  unreadCount,
}: Props) {
  const other = getOtherParticipant(chat, currentUserId);
  const name = other?.user?.displayName ?? other?.user?.username ?? 'Unknown';
  const username = other?.user?.username ?? '';
  const seed = other?.userId ?? chat.id;
  const isOnline = other ? (presence[other.userId] ?? 'offline') === 'online' : false;
  const hasUnread = unreadCount > 0;

  const preview = lastMessage
    ? 'ciphertext' in lastMessage
      ? lastMessage.ciphertext
      : '…'
    : null;

  const timestamp = lastMessage
    ? 'createdAt' in lastMessage
      ? formatChatTime(lastMessage.createdAt)
      : null
    : formatChatTime(chat.createdAt);

  return (
    <Link
      href={`/chats/${chat.id}`}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
        active
          ? 'bg-indigo-600/15 dark:bg-indigo-500/20'
          : hasUnread
          ? 'bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100/80 dark:hover:bg-indigo-950/60'
          : 'hover:bg-gray-100 dark:hover:bg-zinc-800/60'
      }`}
    >
      {/* Avatar with presence dot */}
      <div className="relative flex-shrink-0">
        <Avatar name={name} seed={seed} size="md" />
        {isOnline && (
          <PresenceIndicator
            online
            className="absolute -bottom-0.5 -right-0.5 ring-2 ring-gray-50 dark:ring-zinc-900"
          />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Row 1: name + timestamp */}
        <div className="flex items-baseline justify-between gap-1">
          <p
            className={`truncate text-sm ${
              active
                ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                : hasUnread
                ? 'font-bold text-gray-900 dark:text-zinc-50'
                : 'font-semibold text-gray-900 dark:text-zinc-100'
            }`}
          >
            {name}
          </p>
          {timestamp && (
            <span
              className={`text-[10px] flex-shrink-0 ${
                hasUnread
                  ? 'text-indigo-500 dark:text-indigo-400 font-medium'
                  : 'text-gray-400 dark:text-zinc-500'
              }`}
            >
              {timestamp}
            </span>
          )}
        </div>

        {/* Row 2: preview + unread badge */}
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p
            className={`truncate text-xs ${
              hasUnread
                ? 'text-gray-700 dark:text-zinc-200 font-medium'
                : 'text-gray-500 dark:text-zinc-500'
            }`}
          >
            {preview ?? `@${username}`}
          </p>
          {hasUnread && (
            <span className="flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-indigo-600 dark:bg-indigo-500 text-[10px] font-bold text-white px-1 leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
