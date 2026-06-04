'use client';

import { create } from 'zustand';
import type { AuthSessionDTO } from '@signalix/contracts';
import * as api from '../lib/api-client';
import { clearSession, isAccessTokenExpired, loadSession, saveSession } from '../lib/token-storage';
import { wsClient } from '../lib/ws-client';

interface AuthState {
  session: AuthSessionDTO | null;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  loginWithOAuth: (session: AuthSessionDTO) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  hydrated: false,
  loading: false,
  error: null,

  async hydrate() {
    // Idempotent — only run once per session.
    if (get().hydrated) return;

    const session = loadSession();

    if (!session) {
      set({ hydrated: true });
      return;
    }

    if (isAccessTokenExpired(session.accessTokenExpiresAt)) {
      // Access token expired — try a silent refresh before deciding the user is logged out.
      try {
        const refreshed = await api.refresh(session.refreshToken);
        // api.refresh() already calls saveSession() internally.
        wsClient.connect(refreshed.accessToken);
        set({ hydrated: true, session: refreshed });
      } catch {
        // Refresh token also expired or revoked — force login.
        clearSession();
        set({ hydrated: true, session: null });
      }
      return;
    }

    wsClient.connect(session.accessToken);
    set({ hydrated: true, session });
  },

  async login(identifier, password) {
    set({ loading: true, error: null });
    try {
      const session = await api.login({
        identifier,
        password,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
      saveSession(session);
      wsClient.connect(session.accessToken);
      set({ session, hydrated: true, loading: false });
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Login failed';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  async register(username, email, password) {
    set({ loading: true, error: null });
    try {
      const session = await api.register({
        username,
        email,
        password,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
      saveSession(session);
      wsClient.connect(session.accessToken);
      set({ session, hydrated: true, loading: false });
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Registration failed';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  loginWithOAuth(session) {
    saveSession(session);
    wsClient.connect(session.accessToken);
    set({ session, hydrated: true, error: null });
  },

  logout() {
    wsClient.disconnect();
    clearSession();
    set({ session: null, hydrated: true, error: null });
  },
}));
