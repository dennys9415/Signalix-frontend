'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../../store/auth.store';

export default function RegisterPage() {
  const router = useRouter();
  const { register, loading, error } = useAuthStore();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await register(username, email, password);
      router.replace('/chats');
    } catch {
      // error shown via store
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f2f2f7] dark:bg-[#0c0c12]">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-[18px] bg-[#007aff] flex items-center justify-center shadow-lg shadow-[#007aff]/30">
            <SignalixLogoIcon />
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7] tracking-tight">Signalix</h1>
            <p className="text-[13px] text-[#8e8e93] mt-0.5">Create your account</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/90 dark:bg-[#1c1c24]/90 backdrop-blur-2xl rounded-2xl shadow-lg shadow-black/[0.06] dark:shadow-black/30 border border-black/[0.06] dark:border-white/[0.07] overflow-hidden">
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5">

            <div>
              <label className="block text-[13px] font-medium text-[#6e6e73] dark:text-[#8e8e93] mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.06] dark:border-white/[0.07] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] dark:placeholder-[#636375] focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 dark:focus:ring-[#0a84ff]/15 transition-all"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#6e6e73] dark:text-[#8e8e93] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.06] dark:border-white/[0.07] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] dark:placeholder-[#636375] focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 dark:focus:ring-[#0a84ff]/15 transition-all"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#6e6e73] dark:text-[#8e8e93] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                className="w-full rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.06] dark:border-white/[0.07] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] dark:placeholder-[#636375] focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 dark:focus:ring-[#0a84ff]/15 transition-all"
              />
            </div>

            {error && <p className="text-[13px] text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#007aff] hover:bg-[#0070e0] active:bg-[#006bd6] disabled:opacity-50 px-4 py-2.5 text-[14px] font-semibold text-white transition-all duration-150 shadow-md shadow-[#007aff]/25"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-[#8e8e93] mt-5">
          Already have an account?{' '}
          <Link href="/login" className="text-[#007aff] dark:text-[#0a84ff] font-medium hover:opacity-75 transition-opacity">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function SignalixLogoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-white stroke-[2]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12 C3 6.5 6.5 3 12 3 S21 6.5 21 12 17.5 21 12 21" />
      <path d="M7 12 C7 9 9 7 12 7 S17 9 17 12 15 17 12 17" />
      <circle cx="12" cy="12" r="2" fill="white" stroke="none" />
    </svg>
  );
}
