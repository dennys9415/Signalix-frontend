'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore, DRAFT_PREFIX } from '../../../store/chat.store';
import { MessageView } from '../../../components/MessageView';

interface Props {
  params: Promise<{ chatId: string }>;
}

export default function ChatPage({ params }: Props) {
  const { chatId } = use(params);
  const router = useRouter();

  const chats = useChatStore((s) => s.chats);
  const pendingChatId = useChatStore((s) => s.pendingChatId);
  const clearPendingChatId = useChatStore((s) => s.clearPendingChatId);
  const loadChats = useChatStore((s) => s.loadChats);

  const isDraft = chatId.startsWith(DRAFT_PREFIX);

  useEffect(() => {
    if (isDraft) router.replace('/chats');
  }, [isDraft, router]);

  useEffect(() => {
    if (isDraft || !pendingChatId) return;
    clearPendingChatId();
    void loadChats();
    router.replace(`/chats/${pendingChatId}`);
  }, [isDraft, pendingChatId, clearPendingChatId, loadChats, router]);

  if (isDraft) return null;

  const chat = chats.find((c) => c.id === chatId);

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">
        Loading…
      </div>
    );
  }

  return <MessageView chat={chat} />;
}
