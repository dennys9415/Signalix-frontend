'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore } from '../../store/chat.store';
import { SidebarProvider, useSidebar } from '../../lib/sidebar-context';
import { ChatSidebar } from '../../components/ChatSidebar';
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
    <div className="flex h-full overflow-hidden bg-[#f2f2f7] dark:bg-[#0c0c12] md:p-3 md:gap-3">

      {/* ── Icon rail: desktop only ── */}
      <div className="hidden md:flex flex-col w-[68px] flex-shrink-0 bg-white/[0.82] dark:bg-[#1c1c24]/[0.88] backdrop-blur-2xl rounded-2xl shadow-sm dark:shadow-none border border-black/[0.06] dark:border-white/[0.07] overflow-hidden">
        <IconRail />
      </div>

      {/* ── Chat sidebar ── */}
      <div
        className={`${
          open ? 'flex' : 'hidden'
        } md:flex flex-col w-full md:w-[300px] flex-shrink-0 bg-white/[0.82] dark:bg-[#1c1c24]/[0.88] backdrop-blur-2xl md:rounded-2xl overflow-hidden md:shadow-sm dark:shadow-none md:border md:border-black/[0.06] md:dark:border-white/[0.07]`}
      >
        <ChatSidebar />
      </div>

      {/* ── Main panel ── */}
      <main
        className={`${
          open ? 'hidden' : 'flex'
        } md:flex flex-1 min-h-0 flex-col overflow-hidden bg-white/[0.82] dark:bg-[#1c1c24]/[0.88] backdrop-blur-2xl md:rounded-2xl md:shadow-sm dark:shadow-none md:border md:border-black/[0.06] md:dark:border-white/[0.07]`}
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
