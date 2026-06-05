'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '../../store/chat.store';
import { useSidebar } from '../../lib/sidebar-context';
import { Avatar } from '../../components/Avatar';
import { PresenceIndicator } from '../../components/PresenceIndicator';
import { MessageInput } from '../../components/MessageInput';

export default function ChatsIndexPage() {
  const router = useRouter();
  const { setOpen } = useSidebar();
  const pendingRecipient = useChatStore((s) => s.pendingRecipient);
  const pendingChatId = useChatStore((s) => s.pendingChatId);
  const clearPendingChatId = useChatStore((s) => s.clearPendingChatId);
  const loadChats = useChatStore((s) => s.loadChats);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const presence = useChatStore((s) => s.presence);

  useEffect(() => {
    if (pendingChatId) {
      clearPendingChatId();
      loadChats();
      router.replace(`/chats/${pendingChatId}`);
    }
  }, [pendingChatId, clearPendingChatId, loadChats, router]);

  function handleSend(text: string) {
    if (!pendingRecipient) return;
    sendMessage({ recipientUsername: pendingRecipient.username, ciphertext: text });
  }

  if (pendingRecipient) {
    const name = pendingRecipient.displayName ?? pendingRecipient.username;
    const isOnline = (presence[pendingRecipient.id] ?? 'offline') === 'online';

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.07] bg-white/90 dark:bg-[#1c1c24]/90 backdrop-blur-xl flex-shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="md:hidden flex items-center justify-center w-8 h-8 -ml-1 rounded-xl text-[#007aff] dark:text-[#0a84ff] hover:bg-[#007aff]/[0.08] transition-colors"
            aria-label="Back to chats"
          >
            <BackArrowIcon />
          </button>
          <Avatar name={name} seed={pendingRecipient.id} avatarUrl={pendingRecipient.avatarUrl} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{name}</p>
            <div className="flex items-center gap-1.5">
              <PresenceIndicator online={isOnline} size="sm" />
              <p className={`text-[12px] font-medium ${isOnline ? 'text-emerald-500' : 'text-[#8e8e93] dark:text-[#636375]'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        </div>

        {/* Empty area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8 select-none">
          <Avatar name={name} seed={pendingRecipient.id} avatarUrl={pendingRecipient.avatarUrl} size="xl" />
          <div>
            <p className="text-[16px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{name}</p>
            {pendingRecipient.username && (
              <p className="text-[13px] text-[#8e8e93] mt-0.5">@{pendingRecipient.username}</p>
            )}
          </div>
          <p className="text-[13px] text-[#aeaeb2] dark:text-[#636375] mt-1">Start the conversation.</p>
        </div>

        <MessageInput onSend={handleSend} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8 select-none">
      <EmptyStateIcon />
      <div>
        <p className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Messages</p>
        <p className="text-[13px] text-[#8e8e93] dark:text-[#636375] mt-1">
          Select a conversation or search for someone to get started.
        </p>
      </div>
    </div>
  );
}

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-current stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="12 4 6 10 12 16" />
    </svg>
  );
}

function EmptyStateIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-16 h-16 text-[#c7c7cc] dark:text-[#3c3c44] fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 16a6 6 0 0 1 6-6h32a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H20l-10 8V16z" />
      <line x1="22" y1="27" x2="42" y2="27" />
      <line x1="22" y1="35" x2="34" y2="35" />
    </svg>
  );
}
