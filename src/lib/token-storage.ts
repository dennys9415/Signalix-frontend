import type { AuthSessionDTO } from '@signalix/contracts';

const SESSION_KEY = 'sg_session';

export function saveSession(session: AuthSessionDTO): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): AuthSessionDTO | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSessionDTO;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

export function isAccessTokenExpired(expiresAt: string): boolean {
  // 60s buffer to proactively refresh before hard expiry
  return Date.now() >= new Date(expiresAt).getTime() - 60_000;
}
