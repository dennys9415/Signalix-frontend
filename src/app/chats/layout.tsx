'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore } from '../../store/chat.store';
import { ChatSidebar } from '../../components/ChatSidebar';

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrate = useAuthStore((s) => s.hydrate);
  const loadChats = useChatStore((s) => s.loadChats);
  const initWsHandler = useChatStore((s) => s.initWsHandler);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (session === null) {
      router.replace('/login');
      return;
    }
    initWsHandler();
    loadChats();
  }, [session, initWsHandler, loadChats, router]);

  if (!session) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <ChatSidebar />
      <main className="flex-1 flex flex-col overflow-hidden bg-gray-950">
        {children}
      </main>
    </div>
  );
}
