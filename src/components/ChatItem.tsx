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
}

function getOtherParticipant(chat: ChatDTO, currentUserId: string) {
  return chat.participants.find((p) => p.userId !== currentUserId);
}

export function ChatItem({ chat, currentUserId, presence, active, lastMessage }: Props) {
  const other = getOtherParticipant(chat, currentUserId);
  const name = other?.user?.displayName ?? other?.user?.username ?? 'Unknown';
  const username = other?.user?.username ?? '';
  const seed = other?.userId ?? chat.id;
  const isOnline = other ? (presence[other.userId] ?? 'offline') === 'online' : false;

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
        <div className="flex items-baseline justify-between gap-1">
          <p className={`truncate text-sm font-semibold ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-zinc-100'}`}>
            {name}
          </p>
          {timestamp && (
            <span className="text-[10px] text-gray-400 dark:text-zinc-500 flex-shrink-0">{timestamp}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <p className="truncate text-xs text-gray-500 dark:text-zinc-500">
            {preview ?? `@${username}`}
          </p>
        </div>
      </div>
    </Link>
  );
}
