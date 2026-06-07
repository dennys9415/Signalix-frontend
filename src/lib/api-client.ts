import type {
  AddGroupMembersRequest,
  ApiResponse,
  AuthSessionDTO,
  ChatDTO,
  CreateGroupChatRequest,
  CreateGroupChatResponse,
  DeleteChatForMeResponse,
  DeleteMessageForMeResponse,
  ExactUsernameLookupResponse,
  ForgotPasswordResponse,
  GetMessagesResponse,
  GroupMemberUpdateResponse,
  LoginRequest,
  MarkChatReadResponse,
  PresenceLookupResponse,
  RefreshTokenRequest,
  RegisterRequest,
  RemoveGroupMemberResponse,
  ResendVerificationResponse,
  ResetPasswordResponse,
  GroupAvatarUploadResponse,
  KeyBundleResponse,
  RegisterDeviceKeysRequest,
  RegisterDeviceKeysResponse,
  RotateSignedPreKeyRequest,
  RotateSignedPreKeyResponse,
  SearchInChatResponse,
  SearchMessagesResponse,
  TransferGroupOwnershipRequest,
  TransferGroupOwnershipResponse,
  UpdateGroupChatRequest,
  UploadPreKeysRequest,
  UploadPreKeysResponse,
  UpdateGroupChatResponse,
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

export function searchMessages(
  q: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<SearchMessagesResponse> {
  const qs = new URLSearchParams({ q });
  if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
  if (opts.cursor !== undefined) qs.set('cursor', opts.cursor);
  return authed<SearchMessagesResponse>('GET', `/api/v1/messages/search?${qs.toString()}`);
}

export function searchInChat(
  chatId: string,
  q: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<SearchInChatResponse> {
  const qs = new URLSearchParams({ q });
  if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
  if (opts.cursor !== undefined) qs.set('cursor', opts.cursor);
  return authed<SearchInChatResponse>('GET', `/api/v1/chats/${encodeURIComponent(chatId)}/search?${qs.toString()}`);
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

// Push — VAPID key fetch is public, subscribe/unsubscribe require auth.
export async function getPushPublicKey(): Promise<string> {
  const data = await raw<{ publicKey: string }>('GET', '/api/v1/push/public-key');
  return data.publicKey;
}

export function pushSubscribe(payload: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ subscribed: true }> {
  return authed<{ subscribed: true }>('POST', '/api/v1/push/subscribe', payload);
}

export function pushUnsubscribe(endpoint: string): Promise<{ subscribed: false }> {
  return authed<{ subscribed: false }>('DELETE', '/api/v1/push/unsubscribe', { endpoint });
}

export function uploadMedia(file: File): Promise<{ mediaUrl: string }> {
  const form = new FormData();
  form.append('media', file);
  return authedUpload<{ mediaUrl: string }>('/api/v1/media/upload', form);
}

export function uploadVoice(blob: Blob, filename: string): Promise<{ voiceUrl: string }> {
  const form = new FormData();
  // The File constructor preserves the MIME type the recorder produced
  // (audio/webm or audio/mp4) so the API mime allowlist matches.
  const file = new File([blob], filename, { type: blob.type || 'audio/webm' });
  form.append('audio', file);
  return authedUpload<{ voiceUrl: string }>('/api/v1/media/voice', form);
}

export function createGroupChat(dto: CreateGroupChatRequest): Promise<CreateGroupChatResponse> {
  return authed<CreateGroupChatResponse>('POST', '/api/v1/chats/group', dto);
}

export function addGroupMembers(chatId: string, dto: AddGroupMembersRequest): Promise<GroupMemberUpdateResponse> {
  return authed<GroupMemberUpdateResponse>('POST', `/api/v1/chats/${encodeURIComponent(chatId)}/members`, dto);
}

export function removeGroupMember(chatId: string, userId: string): Promise<RemoveGroupMemberResponse> {
  return authed<RemoveGroupMemberResponse>('DELETE', `/api/v1/chats/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}`);
}

export function updateGroupChat(chatId: string, dto: UpdateGroupChatRequest): Promise<UpdateGroupChatResponse> {
  return authed<UpdateGroupChatResponse>('PATCH', `/api/v1/chats/${encodeURIComponent(chatId)}`, dto);
}

export function uploadGroupAvatar(chatId: string, file: File): Promise<GroupAvatarUploadResponse> {
  const form = new FormData();
  form.append('avatar', file);
  return authedUpload<GroupAvatarUploadResponse>(
    `/api/v1/chats/${encodeURIComponent(chatId)}/avatar`,
    form,
  );
}

export function removeGroupAvatar(chatId: string): Promise<{ chatId: string }> {
  return authed<{ chatId: string }>('DELETE', `/api/v1/chats/${encodeURIComponent(chatId)}/avatar`);
}

export function transferGroupOwnership(
  chatId: string,
  dto: TransferGroupOwnershipRequest,
): Promise<TransferGroupOwnershipResponse> {
  return authed<TransferGroupOwnershipResponse>(
    'POST',
    `/api/v1/chats/${encodeURIComponent(chatId)}/transfer-ownership`,
    dto,
  );
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

// ── Crypto (v0.8.0 foundation, used by the v0.9.0 Signal client) ───────────

export function registerDeviceKeys(dto: RegisterDeviceKeysRequest): Promise<RegisterDeviceKeysResponse> {
  return authed<RegisterDeviceKeysResponse>('POST', '/api/v1/crypto/devices/keys', dto);
}

export function rotateSignedPreKey(dto: RotateSignedPreKeyRequest): Promise<RotateSignedPreKeyResponse> {
  return authed<RotateSignedPreKeyResponse>('PATCH', '/api/v1/crypto/devices/keys/signed-pre-key', dto);
}

export function uploadPreKeys(dto: UploadPreKeysRequest): Promise<UploadPreKeysResponse> {
  return authed<UploadPreKeysResponse>('POST', '/api/v1/crypto/devices/keys/pre-keys', dto);
}

export function getKeyBundle(userId: string): Promise<KeyBundleResponse> {
  return authed<KeyBundleResponse>('GET', `/api/v1/crypto/users/${encodeURIComponent(userId)}/key-bundle`);
}
