import Link from 'next/link';
import { ChatType, MessageType, type ChatDTO } from '@signalix/contracts';
import { DRAFT_PREFIX, type StoredMessage } from '../store/chat.store';
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
  onDraftClick?: (chat: ChatDTO) => void;
}

function getOtherParticipant(chat: ChatDTO, currentUserId: string) {
  return chat.participants.find((p) => p.userId !== currentUserId);
}

export function ChatItem({ chat, currentUserId, presence, active, lastMessage, unreadCount, onDraftClick }: Props) {
  const isGroup = chat.type === ChatType.GROUP;
  const other = isGroup ? undefined : getOtherParticipant(chat, currentUserId);
  const name = isGroup
    ? (chat.title ?? 'Group')
    : (other?.user?.displayName ?? other?.user?.username ?? 'Unknown');
  const username = other?.user?.username ?? '';
  const seed = isGroup ? chat.id : (other?.userId ?? chat.id);
  const isOnline = !isGroup && other ? (presence[other.userId] ?? 'offline') === 'online' : false;
  const hasUnread = unreadCount > 0;

  const isDraft = chat.id.startsWith(DRAFT_PREFIX);

  const preview = isDraft
    ? 'New conversation'
    : lastMessage
    ? 'ciphertext' in lastMessage
      ? ('deletedAt' in lastMessage && lastMessage.deletedAt
          ? '🚫 Message deleted'
          : ('messageType' in lastMessage && lastMessage.messageType === MessageType.IMAGE)
            ? '📷 Image'
            : ('messageType' in lastMessage && lastMessage.messageType === MessageType.FILE)
              ? (() => { try { const p = JSON.parse(lastMessage.ciphertext) as { name?: string }; return `📎 ${p.name ?? 'File'}`; } catch { return '📎 File'; } })()
              : lastMessage.ciphertext)
      : '…'
    : null;

  const timestamp = lastMessage
    ? 'createdAt' in lastMessage ? formatChatTime(lastMessage.createdAt) : null
    : formatChatTime(chat.createdAt);

  const rowClassName = `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 w-full text-left ${
    active
      ? 'bg-[#007aff]/[0.08] dark:bg-[#007aff]/[0.10]'
      : hasUnread
      ? 'bg-[#007aff]/[0.04] dark:bg-[#007aff]/[0.06] hover:bg-[#007aff]/[0.07] dark:hover:bg-[#007aff]/[0.09]'
      : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
  }`;

  const rowContent = (
    <>
      {/* Avatar with presence dot */}
      <div className="relative flex-shrink-0">
        <Avatar name={name} seed={seed} avatarUrl={isGroup ? undefined : other?.user?.avatarUrl} size="md" />
        {isOnline && (
          <PresenceIndicator
            online
            className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white dark:ring-[#1c1c24]"
          />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Name + timestamp */}
        <div className="flex items-baseline justify-between gap-1">
          <p className={`truncate text-[14px] leading-snug ${
            active
              ? 'font-semibold text-[#007aff] dark:text-[#0a84ff]'
              : hasUnread
              ? 'font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]'
              : 'font-medium text-[#1d1d1f] dark:text-[#f5f5f7]'
          }`}>
            {name}
          </p>
          {timestamp && (
            <span className={`text-[11px] flex-shrink-0 tabular-nums ${
              hasUnread
                ? 'text-[#007aff] dark:text-[#0a84ff] font-medium'
                : 'text-[#aeaeb2] dark:text-[#636375]'
            }`}>
              {timestamp}
            </span>
          )}
        </div>

        {/* Preview + unread badge */}
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className={`truncate text-[13px] leading-snug ${
            hasUnread
              ? 'text-[#1d1d1f] dark:text-[#d1d1d6] font-medium'
              : 'text-[#aeaeb2] dark:text-[#636375]'
          }`}>
            {preview ?? (isGroup ? `${chat.participants.length} members` : `@${username}`)}
          </p>
          {hasUnread && (
            <span className="flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-[#007aff] text-[11px] font-semibold text-white px-1.5 leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </>
  );

  // Drafts must not route to /chats/draft:<id> — they live at /chats only.
  if (isDraft && onDraftClick) {
    return (
      <button type="button" onClick={() => onDraftClick(chat)} className={rowClassName}>
        {rowContent}
      </button>
    );
  }

  return (
    <Link href={`/chats/${chat.id}`} className={rowClassName}>
      {rowContent}
    </Link>
  );
}
