'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/auth.store';

export default function RootPage() {
  const router = useRouter();
  const hydrate = useAuthStore((s) => s.hydrate);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (session) {
      router.replace('/chats');
    } else {
      router.replace('/login');
    }
  }, [session, router]);

  return null;
}
