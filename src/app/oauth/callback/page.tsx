'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AuthSessionDTO } from '@signalix/contracts';
import { useAuthStore } from '../../../store/auth.store';

function OAuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginWithOAuth = useAuthStore((s) => s.loginWithOAuth);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      router.replace(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    const userId = searchParams.get('userId');
    const deviceId = searchParams.get('deviceId');
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const accessTokenExpiresAt = searchParams.get('accessTokenExpiresAt');
    const refreshTokenExpiresAt = searchParams.get('refreshTokenExpiresAt');

    if (
      !userId ||
      !deviceId ||
      !accessToken ||
      !refreshToken ||
      !accessTokenExpiresAt ||
      !refreshTokenExpiresAt
    ) {
      router.replace('/login?error=oauth_failed');
      return;
    }

    const session: AuthSessionDTO = {
      userId,
      deviceId,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };

    loginWithOAuth(session);
    router.replace('/chats');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">Signing you in…</p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">Signing you in…</p>
        </div>
      }
    >
      <OAuthCallbackInner />
    </Suspense>
  );
}
