'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ApiError, forgotPassword } from '../../lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full rounded-full bg-white/55 dark:bg-white/[0.06] border border-white/60 dark:border-white/[0.06] px-4 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#8e8e93] dark:placeholder-[#9a9aa3] focus:outline-none focus:bg-white/75 dark:focus:bg-white/[0.09] focus:border-white/80 transition-all duration-200';

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl rounded-3xl shadow-glass border border-white/60 dark:border-white/[0.06] p-6 text-center space-y-3">
            <h1 className="text-[18px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">Check your email</h1>
            <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3]">
              If an account with that email exists, a reset link has been sent. Check your inbox.
            </p>
            <Link href="/login" className="block text-[13px] text-[#007aff] dark:text-[#0a84ff] hover:opacity-75 transition-opacity">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-[22px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7] tracking-tight">Reset your password</h1>
          <p className="text-[13px] text-[#8e8e93] dark:text-[#9a9aa3] mt-1">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        <div className="bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl rounded-3xl shadow-glass border border-white/60 dark:border-white/[0.06] overflow-hidden">
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
            <div>
              <label className="block text-[13px] font-medium text-[#6e6e73] dark:text-[#9a9aa3] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputCls}
              />
            </div>

            {error && <p className="text-[13px] text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#007aff] hover:bg-[#0070e0] active:bg-[#006bd6] disabled:opacity-50 px-4 py-2.5 text-[14px] font-semibold text-white transition-all duration-200 shadow-glass-sm hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
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
