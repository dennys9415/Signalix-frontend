'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore } from '../../store/chat.store';
import { SidebarProvider, useSidebar } from '../../lib/sidebar-context';
import { ChatSidebar } from '../../components/ChatSidebar';
import { EncryptionResetBanner } from '../../components/EncryptionResetBanner';
import { IconRail } from '../../components/IconRail';
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
    requestNotificationPermission();
  }, [hydrated, session, initWsHandler, loadChats]);

  if (!hydrated || !session) return null;

  return (
    <div className="flex h-full overflow-hidden md:p-3 md:gap-3">

      {/* ── Icon rail: desktop only ── */}
      <div className="hidden md:flex flex-col w-[68px] flex-shrink-0 surface-glass rounded-3xl shadow-glass-sm overflow-hidden">
        <IconRail />
      </div>

      {/* ── Chat sidebar ── */}
      <div
        className={`${
          open ? 'flex' : 'hidden'
        } md:flex flex-col w-full md:w-[300px] flex-shrink-0 surface-glass overflow-hidden md:rounded-3xl md:shadow-glass-sm`}
      >
        <ChatSidebar />
      </div>

      {/* ── Main panel ── */}
      <main
        className={`${
          open ? 'hidden' : 'flex'
        } md:flex flex-1 min-h-0 flex-col overflow-hidden surface-glass md:rounded-3xl md:shadow-glass`}
      >
        <EncryptionResetBanner />
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
