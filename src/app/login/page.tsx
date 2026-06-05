'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../../store/auth.store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function OAuthError() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  if (!error) return null;
  const msg =
    error === 'oauth_cancelled'
      ? 'Google sign-in was cancelled.'
      : 'Google sign-in failed. Please try again.';
  return <p className="text-[13px] text-red-500">{msg}</p>;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, error } = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(identifier, password);
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
            <p className="text-[13px] text-[#8e8e93] mt-0.5">Sign in to continue</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/90 dark:bg-[#1c1c24]/90 backdrop-blur-2xl rounded-2xl shadow-lg shadow-black/[0.06] dark:shadow-black/30 border border-black/[0.06] dark:border-white/[0.07] overflow-hidden">

          {/* OAuth providers */}
          <div className="p-5 space-y-2.5">
            <a
              href={`${API_BASE}/api/v1/auth/google`}
              className="flex items-center justify-center gap-2.5 w-full rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 hover:bg-[#e5e5ea] dark:hover:bg-[#1e1e2a] border border-black/[0.06] dark:border-white/[0.06] px-4 py-2.5 text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] transition-all duration-150"
            >
              <GoogleIcon />
              Continue with Google
            </a>
            <a
              href={`${API_BASE}/api/v1/auth/github`}
              className="flex items-center justify-center gap-2.5 w-full rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 hover:bg-[#e5e5ea] dark:hover:bg-[#1e1e2a] border border-black/[0.06] dark:border-white/[0.06] px-4 py-2.5 text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] transition-all duration-150"
            >
              <GitHubIcon />
              Continue with GitHub
            </a>
            <a
              href={`${API_BASE}/api/v1/auth/apple`}
              className="flex items-center justify-center gap-2.5 w-full rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 hover:bg-[#e5e5ea] dark:hover:bg-[#1e1e2a] border border-black/[0.06] dark:border-white/[0.06] px-4 py-2.5 text-[14px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] transition-all duration-150"
            >
              <AppleIcon />
              Continue with Apple
            </a>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 px-5">
            <hr className="flex-1 border-black/[0.06] dark:border-white/[0.06]" />
            <span className="text-[12px] text-[#aeaeb2]">or</span>
            <hr className="flex-1 border-black/[0.06] dark:border-white/[0.06]" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 pt-4 space-y-3.5">
            <div>
              <label className="block text-[13px] font-medium text-[#6e6e73] dark:text-[#8e8e93] mb-1.5">
                Username or email
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                className="w-full rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.06] dark:border-white/[0.07] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] dark:placeholder-[#636375] focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 dark:focus:ring-[#0a84ff]/15 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[13px] font-medium text-[#6e6e73] dark:text-[#8e8e93]">Password</label>
                <Link href="/forgot-password" className="text-[12px] text-[#007aff] dark:text-[#0a84ff] hover:opacity-75 transition-opacity">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl bg-[#f2f2f7]/80 dark:bg-[#16161e]/60 border border-black/[0.06] dark:border-white/[0.07] px-3.5 py-2.5 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#aeaeb2] dark:placeholder-[#636375] focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 dark:focus:ring-[#0a84ff]/15 transition-all"
              />
            </div>

            <Suspense fallback={null}>
              <OAuthError />
            </Suspense>

            {error && <p className="text-[13px] text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#007aff] hover:bg-[#0070e0] active:bg-[#006bd6] disabled:opacity-50 px-4 py-2.5 text-[14px] font-semibold text-white transition-all duration-150 shadow-md shadow-[#007aff]/25"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-[#8e8e93] mt-5">
          No account?{' '}
          <Link href="/register" className="text-[#007aff] dark:text-[#0a84ff] font-medium hover:opacity-75 transition-opacity">
            Register
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#1d1d1f] dark:text-[#f5f5f7] fill-current" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#1d1d1f] dark:text-[#f5f5f7] fill-current" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.39-1.32 2.76-2.54 4zm-3.1-17.26c.06 1.96-1.52 3.57-3.36 3.65-.19-1.83 1.55-3.57 3.36-3.65z" />
    </svg>
  );
}
