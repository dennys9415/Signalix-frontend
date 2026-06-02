import Link from 'next/link';
import type { ChatDTO } from '@signalix/contracts';
import { PresenceIndicator } from './PresenceIndicator';

interface Props {
  chat: ChatDTO;
  currentUserId: string;
  presence: Record<string, 'online' | 'offline'>;
  active: boolean;
}

function getOtherParticipant(chat: ChatDTO, currentUserId: string) {
  return chat.participants.find((p) => p.userId !== currentUserId);
}

export function ChatItem({ chat, currentUserId, presence, active }: Props) {
  const other = getOtherParticipant(chat, currentUserId);
  const name = other?.user?.displayName ?? other?.user?.username ?? 'Unknown';
  const isOnline = other ? (presence[other.userId] ?? 'offline') === 'online' : false;

  return (
    <Link
      href={`/chats/${chat.id}`}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        active ? 'bg-gray-800' : 'hover:bg-gray-800/60'
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-indigo-700 flex items-center justify-center text-sm font-semibold uppercase">
          {name.charAt(0)}
        </div>
        <PresenceIndicator
          online={isOnline}
          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-gray-950"
        />
      </div>
      <span className="truncate text-sm font-medium">{name}</span>
    </Link>
  );
}
