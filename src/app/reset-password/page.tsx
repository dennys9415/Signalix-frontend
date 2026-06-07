'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ApiError, resetPassword } from '../../lib/api-client';

const inputCls = 'w-full rounded-full bg-white/55 dark:bg-white/[0.06] border border-white/60 dark:border-white/[0.06] px-4 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#8e8e93] dark:placeholder-[#9a9aa3] focus:outline-none focus:bg-white/75 dark:focus:bg-white/[0.09] focus:border-white/80 transition-all duration-200';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="text-center space-y-3 p-5">
        <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">This link is invalid or has expired.</p>
        <Link href="/forgot-password" className="text-[13px] text-[#007aff] dark:text-[#0a84ff] hover:opacity-75 transition-opacity">
          Request a new reset link
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPassword(token, newPassword);
      router.replace('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
      <div>
        <label className="block text-[13px] font-medium text-[#6e6e73] dark:text-[#9a9aa3] mb-1.5">New password</label>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" className={inputCls} />
      </div>

      <div>
        <label className="block text-[13px] font-medium text-[#6e6e73] dark:text-[#9a9aa3] mb-1.5">Confirm password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" className={inputCls} />
      </div>

      {error && <p className="text-[13px] text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-[#007aff] hover:bg-[#0070e0] active:bg-[#006bd6] disabled:opacity-50 px-4 py-2.5 text-[14px] font-semibold text-white transition-all duration-200 shadow-glass-sm hover:scale-[1.01] active:scale-[0.99]"
      >
        {loading ? 'Resetting…' : 'Set new password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-[22px] font-bold text-center text-[#1d1d1f] dark:text-[#f5f5f7] tracking-tight mb-6">Set new password</h1>
        <div className="bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl rounded-3xl shadow-glass border border-white/60 dark:border-white/[0.06] overflow-hidden">
          <Suspense fallback={<p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3] text-center p-5">Loading…</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
        <p className="text-center text-[13px] text-[#8e8e93] dark:text-[#9a9aa3] mt-5">
          <Link href="/login" className="text-[#007aff] dark:text-[#0a84ff] font-medium hover:opacity-75 transition-opacity">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
