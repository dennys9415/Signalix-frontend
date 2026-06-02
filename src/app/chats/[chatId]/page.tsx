'use client';

import { use } from 'react';
import { useChatStore } from '../../../store/chat.store';
import { MessageView } from '../../../components/MessageView';

interface Props {
  params: Promise<{ chatId: string }>;
}

export default function ChatPage({ params }: Props) {
  const { chatId } = use(params);
  const chats = useChatStore((s) => s.chats);
  const chat = chats.find((c) => c.id === chatId);

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
        Loading…
      </div>
    );
  }

  return <MessageView chat={chat} />;
}
