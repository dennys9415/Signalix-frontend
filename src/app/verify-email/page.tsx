'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmail } from '../../lib/api-client';

type State = 'loading' | 'success' | 'error';

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('error');
      return;
    }

    verifyEmail(token)
      .then(() => setState('success'))
      .catch(() => setState('error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">Verifying your email…</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl rounded-3xl shadow-glass border border-white/60 dark:border-white/[0.06] p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 dark:bg-emerald-500/15 backdrop-blur-xl border border-emerald-500/25 flex items-center justify-center mx-auto">
              <svg viewBox="0 0 24 24" className="w-7 h-7 stroke-emerald-500 fill-none stroke-2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-[18px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">Email verified</h1>
            <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">
              Your email has been verified successfully. You can now continue to Signalix.
            </p>
            <Link
              href="/chats"
              className="inline-block rounded-full bg-[#007aff] hover:bg-[#0070e0] active:bg-[#006bd6] px-6 py-2.5 text-[14px] font-semibold text-white transition-all duration-200 shadow-glass-sm hover:scale-[1.01] active:scale-[0.99]"
            >
              Go to Signalix
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl rounded-3xl shadow-glass border border-white/60 dark:border-white/[0.06] p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-500/15 dark:bg-red-500/15 backdrop-blur-xl border border-red-500/25 flex items-center justify-center mx-auto">
            <svg viewBox="0 0 24 24" className="w-7 h-7 stroke-red-500 fill-none stroke-2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <h1 className="text-[18px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">Verification failed</h1>
          <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">
            This verification link is invalid or has expired.
          </p>
          <Link
            href="/login"
            className="inline-block text-[13px] text-[#007aff] dark:text-[#0a84ff] font-medium hover:opacity-75 transition-opacity"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">Verifying your email…</p>
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
