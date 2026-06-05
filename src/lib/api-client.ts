import type {
  ApiResponse,
  AuthSessionDTO,
  ChatDTO,
  DeleteChatForMeResponse,
  DeleteMessageForMeResponse,
  ExactUsernameLookupResponse,
  ForgotPasswordResponse,
  GetMessagesResponse,
  LoginRequest,
  MarkChatReadResponse,
  PresenceLookupResponse,
  RefreshTokenRequest,
  RegisterRequest,
  ResendVerificationResponse,
  ResetPasswordResponse,
  UserProfileResponse,
  UserSearchResponse,
  VerifyEmailResponse,
} from '@signalix/contracts';
import { loadSession, saveSession } from './token-storage';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function raw<T>(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success || json.data === undefined) {
    throw new ApiError(
      json.error?.message ?? `${method} ${path} → ${res.status}`,
      res.status,
      json.error?.code,
    );
  }
  return json.data;
}

// Silently refresh and retry on 401
async function authed<T>(method: string, path: string, body?: unknown): Promise<T> {
  const session = loadSession();
  if (!session) throw new ApiError('Not authenticated', 401);

  try {
    return await raw<T>(method, path, { body, token: session.accessToken });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await refresh(session.refreshToken);
      return await raw<T>(method, path, { body, token: refreshed.accessToken });
    }
    throw err;
  }
}

// Multipart upload — no Content-Type header (browser sets boundary automatically)
async function authedUpload<T>(path: string, form: FormData): Promise<T> {
  const session = loadSession();
  if (!session) throw new ApiError('Not authenticated', 401);

  async function attempt(token: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = (await res.json()) as ApiResponse<T>;
    if (!json.success || json.data === undefined) {
      throw new ApiError(
        json.error?.message ?? `POST ${path} → ${res.status}`,
        res.status,
        json.error?.code,
      );
    }
    return json.data;
  }

  try {
    return await attempt(session.accessToken);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await refresh(session.refreshToken);
      return await attempt(refreshed.accessToken);
    }
    throw err;
  }
}

// ─── Public auth endpoints ────────────────────────────────────────────────────

export function register(dto: RegisterRequest): Promise<AuthSessionDTO> {
  return raw<AuthSessionDTO>('POST', '/api/v1/auth/register', { body: dto });
}

export function login(dto: LoginRequest): Promise<AuthSessionDTO> {
  return raw<AuthSessionDTO>('POST', '/api/v1/auth/login', { body: dto });
}

export async function refresh(refreshToken: string): Promise<AuthSessionDTO> {
  const body: RefreshTokenRequest = { refreshToken };
  const session = await raw<AuthSessionDTO>('POST', '/api/v1/auth/refresh', { body });
  saveSession(session);
  return session;
}

// ─── Authenticated endpoints ──────────────────────────────────────────────────

export function getChats(): Promise<{ chats: ChatDTO[] }> {
  return authed<{ chats: ChatDTO[] }>('GET', '/api/v1/chats');
}

export function getMessages(
  chatId: string,
  params?: { limit?: number; cursor?: string },
): Promise<GetMessagesResponse> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  const suffix = qs.size ? `?${qs.toString()}` : '';
  return authed<GetMessagesResponse>('GET', `/api/v1/chats/${chatId}/messages${suffix}`);
}

export function lookupUser(username: string): Promise<ExactUsernameLookupResponse> {
  return authed<ExactUsernameLookupResponse>(
    'GET',
    `/api/v1/users/lookup/${encodeURIComponent(username)}`,
  );
}

export function searchUsers(q: string, limit?: number): Promise<UserSearchResponse> {
  const qs = new URLSearchParams({ q });
  if (limit !== undefined) qs.set('limit', String(limit));
  return authed<UserSearchResponse>('GET', `/api/v1/users/search?${qs.toString()}`);
}

export function getMe(): Promise<UserProfileResponse> {
  return authed<UserProfileResponse>('GET', '/api/v1/users/me');
}

export function deleteMessageForMe(messageId: string): Promise<DeleteMessageForMeResponse> {
  return authed<DeleteMessageForMeResponse>(
    'POST',
    `/api/v1/messages/${encodeURIComponent(messageId)}/delete-for-me`,
  );
}

export function getPresence(userIds: string[]): Promise<PresenceLookupResponse> {
  if (userIds.length === 0) return Promise.resolve({ presence: [] });
  return authed<PresenceLookupResponse>(
    'GET',
    `/api/v1/presence?userIds=${userIds.map(encodeURIComponent).join(',')}`,
  );
}

export function markChatRead(chatId: string): Promise<MarkChatReadResponse> {
  return authed<MarkChatReadResponse>(
    'POST',
    `/api/v1/chats/${encodeURIComponent(chatId)}/read`,
  );
}

export function deleteChatForMe(chatId: string): Promise<DeleteChatForMeResponse> {
  return authed<DeleteChatForMeResponse>(
    'POST',
    `/api/v1/chats/${encodeURIComponent(chatId)}/delete-for-me`,
  );
}

export function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return raw<ForgotPasswordResponse>('POST', '/api/v1/auth/forgot-password', { body: { email } });
}

export function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  return raw<VerifyEmailResponse>('POST', '/api/v1/auth/verify-email', { body: { token } });
}

export function resendVerification(email: string): Promise<ResendVerificationResponse> {
  return raw<ResendVerificationResponse>('POST', '/api/v1/auth/resend-verification', { body: { email } });
}

export function resetPassword(token: string, newPassword: string): Promise<ResetPasswordResponse> {
  return raw<ResetPasswordResponse>('POST', '/api/v1/auth/reset-password', { body: { token, newPassword } });
}

export function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const form = new FormData();
  form.append('avatar', file);
  return authedUpload<{ avatarUrl: string }>('/api/v1/profile/avatar', form);
}

export function removeAvatar(): Promise<void> {
  return authed<void>('DELETE', '/api/v1/profile/avatar');
}

export function uploadMedia(file: File): Promise<{ mediaUrl: string }> {
  const form = new FormData();
  form.append('media', file);
  return authedUpload<{ mediaUrl: string }>('/api/v1/media/upload', form);
}

export function uploadFile(
  file: File,
): Promise<{ fileUrl: string; fileName: string; fileSize: number }> {
  const form = new FormData();
  form.append('file', file);
  return authedUpload<{ fileUrl: string; fileName: string; fileSize: number }>(
    '/api/v1/files/upload',
    form,
  );
}

export async function downloadFileAttachment(messageId: string, fileName: string): Promise<void> {
  const session = loadSession();
  if (!session) throw new ApiError('Not authenticated', 401);

  async function attempt(token: string): Promise<void> {
    const res = await fetch(`${BASE}/api/v1/files/${encodeURIComponent(messageId)}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const json = (await res.json()) as ApiResponse<never>;
      throw new ApiError(json.error?.message ?? `Download failed: ${res.status}`, res.status, json.error?.code);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  try {
    await attempt(session.accessToken);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await refresh(session.refreshToken);
      await attempt(refreshed.accessToken);
      return;
    }
    throw err;
  }
}
