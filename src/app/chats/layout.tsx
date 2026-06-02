'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth.store';
import { useChatStore } from '../../store/chat.store';
import { ChatSidebar } from '../../components/ChatSidebar';

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const loadChats = useChatStore((s) => s.loadChats);
  const initWsHandler = useChatStore((s) => s.initWsHandler);

  // Tracks which userId has been initialized so init runs once per authenticated session,
  // not on every navigation (router reference changes in Next.js 15 App Router after push/replace).
  const initializedForUser = useRef<string | null>(null);

  // Handles the case where the user navigates directly to /chats without going through root.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Auth guard — separate from init so router changes don't re-trigger initWsHandler/loadChats.
  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      router.replace('/login');
    }
  }, [hydrated, session, router]);

  // One-time init per authenticated user identity.
  useEffect(() => {
    if (!hydrated || !session) return;
    if (initializedForUser.current === session.userId) return;
    initializedForUser.current = session.userId;
    initWsHandler();
    loadChats();
  }, [hydrated, session, initWsHandler, loadChats]);

  // Hold render until hydration is complete to prevent a flash of the login redirect.
  if (!hydrated || !session) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <ChatSidebar />
      <main className="flex-1 flex flex-col overflow-hidden bg-gray-950">
        {children}
      </main>
    </div>
  );
}
