'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '../../store/chat.store';
import { MessageView } from '../../components/MessageView';

export default function ChatsIndexPage() {
  const router = useRouter();
  const currentDraft = useChatStore((s) => s.currentDraft);
  const pendingChatId = useChatStore((s) => s.pendingChatId);
  const removeDraftChat = useChatStore((s) => s.removeDraftChat);
  const clearPendingChatId = useChatStore((s) => s.clearPendingChatId);
  const loadChats = useChatStore((s) => s.loadChats);

  useEffect(() => {
    if (!pendingChatId) return;
    if (currentDraft) removeDraftChat(currentDraft.id);
    clearPendingChatId();
    void loadChats();
    router.replace(`/chats/${pendingChatId}`);
  }, [pendingChatId, currentDraft, removeDraftChat, clearPendingChatId, loadChats, router]);

  if (currentDraft) {
    return <MessageView chat={currentDraft} />;
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

function EmptyStateIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-16 h-16 text-[#c7c7cc] dark:text-[#3c3c44] fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 16a6 6 0 0 1 6-6h32a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H20l-10 8V16z" />
      <line x1="22" y1="27" x2="42" y2="27" />
      <line x1="22" y1="35" x2="34" y2="35" />
    </svg>
  );
}
