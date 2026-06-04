'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore } from '../../store/chat.store';
import { SidebarProvider, useSidebar } from '../../lib/sidebar-context';
import { ChatSidebar } from '../../components/ChatSidebar';
import { requestNotificationPermission } from '../../lib/notification';

function ChatsShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const loadChats = useChatStore((s) => s.loadChats);
  const initWsHandler = useChatStore((s) => s.initWsHandler);
  const { open } = useSidebar();

  const initializedForUser = useRef<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace('/login');
  }, [hydrated, session, router]);

  useEffect(() => {
    if (!hydrated || !session) return;
    if (initializedForUser.current === session.userId) return;
    initializedForUser.current = session.userId;
    initWsHandler();
    loadChats();
    // Ask for notification permission once per session after the user is signed in.
    requestNotificationPermission();
  }, [hydrated, session, initWsHandler, loadChats]);

  if (!hydrated || !session) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-zinc-950">
      {/* Sidebar: full-width on mobile when open, fixed-width on desktop */}
      <div
        className={`${
          open ? 'flex' : 'hidden'
        } md:flex flex-col w-full md:w-72 flex-shrink-0`}
      >
        <ChatSidebar />
      </div>

      {/* Main: hidden on mobile when sidebar is open */}
      <main
        className={`${
          open ? 'hidden' : 'flex'
        } md:flex flex-1 flex-col overflow-hidden`}
      >
        {children}
      </main>
    </div>
  );
}

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ChatsShell>{children}</ChatsShell>
    </SidebarProvider>
  );
}
