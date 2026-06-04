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
        <p className="text-sm text-gray-400">Verifying your email…</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-green-900/40 border border-green-700 flex items-center justify-center mx-auto">
            <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-green-400 fill-none stroke-2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold">Email verified</h1>
          <p className="text-sm text-gray-400">
            Your email has been verified successfully. You can now continue to Signalix.
          </p>
          <Link
            href="/chats"
            className="inline-block rounded-md bg-indigo-600 hover:bg-indigo-500 px-6 py-2 text-sm font-semibold transition-colors"
          >
            Go to Signalix
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-900/40 border border-red-800 flex items-center justify-center mx-auto">
          <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-red-400 fill-none stroke-2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold">Verification failed</h1>
        <p className="text-sm text-gray-400">
          This verification link is invalid or has expired.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm text-indigo-400 hover:underline"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-sm text-gray-400">Verifying your email…</p>
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
