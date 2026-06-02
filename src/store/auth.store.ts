'use client';

import { create } from 'zustand';
import type { AuthSessionDTO } from '@signalix/contracts';
import * as api from '../lib/api-client';
import { clearSession, loadSession, saveSession } from '../lib/token-storage';
import { wsClient } from '../lib/ws-client';

interface AuthState {
  session: AuthSessionDTO | null;
  loading: boolean;
  error: string | null;
  hydrate: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  loading: false,
  error: null,

  hydrate() {
    const session = loadSession();
    set({ session });
    if (session) {
      wsClient.connect(session.accessToken);
    }
  },

  async login(identifier, password) {
    set({ loading: true, error: null });
    try {
      const session = await api.login({ identifier, password });
      saveSession(session);
      wsClient.connect(session.accessToken);
      set({ session, loading: false });
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Login failed';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  async register(username, email, password) {
    set({ loading: true, error: null });
    try {
      const session = await api.register({ username, email, password });
      saveSession(session);
      wsClient.connect(session.accessToken);
      set({ session, loading: false });
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : 'Registration failed';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  logout() {
    wsClient.disconnect();
    clearSession();
    set({ session: null, error: null });
  },
}));
