'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '../../store/chat.store';
import { useAuthStore } from '../../store/auth.store';

export default function ChatsIndexPage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const pendingRecipient = useChatStore((s) => s.pendingRecipient);
  const pendingChatId = useChatStore((s) => s.pendingChatId);
  const clearPendingChatId = useChatStore((s) => s.clearPendingChatId);
  const sendMessage = useChatStore((s) => s.sendMessage);

  // Navigate to new chat once server confirms it
  useEffect(() => {
    if (pendingChatId) {
      clearPendingChatId();
      router.replace(`/chats/${pendingChatId}`);
    }
  }, [pendingChatId, clearPendingChatId, router]);

  function handleSend(text: string) {
    if (!pendingRecipient) return;
    sendMessage({ recipientUsername: pendingRecipient.username, ciphertext: text });
  }

  if (pendingRecipient) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-semibold uppercase">
            {(pendingRecipient.displayName ?? pendingRecipient.username).charAt(0)}
          </div>
          <p className="text-sm font-medium">
            {pendingRecipient.displayName ?? pendingRecipient.username}
          </p>
        </div>
        <div className="flex-1" />
        <div className="px-4 py-3 border-t border-gray-800 bg-gray-900 flex items-end gap-2">
          <input
            type="text"
            placeholder="Send a first message…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                handleSend(e.currentTarget.value.trim());
                e.currentTarget.value = '';
              }
            }}
            className="flex-1 rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center text-gray-600 text-sm select-none">
      Select a conversation or search for a user to start chatting.
    </div>
  );
}
