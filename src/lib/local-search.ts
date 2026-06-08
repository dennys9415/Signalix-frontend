// v0.13.0 — client-side message search.
//
// Server-side ILIKE on `messages.ciphertext` can't see the body of
// v0.10.0+ encrypted messages (the row stores '' and the plaintext
// lives in `group_message_recipients` as a per-recipient envelope the
// server can't open). This module walks the chat store's in-memory
// messages — already decrypted via `decryptStoredMessage` — and emits
// hits in the same shape the server search endpoint returns, so the UI
// can merge both result sets with a single dedup-by-messageId pass.
//
// Limitation: only messages that have been loaded into the store get
// searched. Older history that the user never paginated to is not
// indexed here; the server side covers what it can (non-encrypted
// metadata + group titles + usernames).

import type {
  ChatDTO,
  InChatSearchMatchDTO,
  MessageDTO,
  MessageSearchResultDTO,
} from '@signalix/contracts';
import { ChatType, MessageType } from '@signalix/contracts';
import type { StoredMessage } from '../store/chat.store';

interface LocalSearchInputs {
  /** All chats currently in the store — used to fill in chat metadata on hits. */
  chats: ChatDTO[];
  /** chatId → in-memory messages (the same shape `state.messages` carries). */
  messagesByChat: Record<string, StoredMessage[]>;
  /** Caller user id — needed to label direct chats as "the OTHER participant". */
  currentUserId: string;
}

interface SearchOptions {
  /** Restrict the walk to a single chat (in-chat search path). */
  chatId?: string;
  /** Cap on results to avoid filling the UI with hundreds of hits. */
  limit?: number;
}

/**
 * Run a case-insensitive substring search over the in-memory message
 * store. Returns `MessageSearchResultDTO` records sorted newest-first,
 * matching the wire shape of the server's global search so callers can
 * merge both result sets uniformly.
 */
export function searchLocalMessages(
  query: string,
  inputs: LocalSearchInputs,
  opts: SearchOptions = {},
): MessageSearchResultDTO[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const limit = opts.limit ?? 50;
  const out: MessageSearchResultDTO[] = [];

  const chatIds = opts.chatId
    ? [opts.chatId]
    : Object.keys(inputs.messagesByChat);

  for (const chatId of chatIds) {
    const chat = inputs.chats.find((c) => c.id === chatId);
    if (!chat) continue;
    const msgs = inputs.messagesByChat[chatId] ?? [];
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const m = msgs[i];
      if (!('id' in m)) continue; // skip optimistic TempMessage rows
      const dto = m as MessageDTO;
      if (dto.deletedAt) continue;
      const hay = extractSearchableText(dto);
      if (!hay) continue;
      if (!hay.toLowerCase().includes(needle)) continue;

      out.push(toResultDTO(dto, chat, inputs.currentUserId));
      if (out.length >= limit) return sortByCreatedAtDesc(out);
    }
  }

  return sortByCreatedAtDesc(out);
}

/**
 * Same as `searchLocalMessages` but scoped to a single chat and emits
 * the `InChatSearchMatchDTO` shape that the in-chat search bar already
 * consumes. Avoids the caller having to translate.
 */
export function searchLocalChatMessages(
  query: string,
  chatId: string,
  inputs: LocalSearchInputs,
  opts: { limit?: number } = {},
): InChatSearchMatchDTO[] {
  const results = searchLocalMessages(query, inputs, { chatId, limit: opts.limit ?? 200 });
  return results.map((r) => ({
    messageId: r.messageId,
    senderId: r.senderId,
    senderName: r.senderName,
    ciphertext: r.ciphertext,
    // Local hits are always TEXT today (we only index text content);
    // future: detect FILE/AUDIO/IMAGE and report that messageType.
    messageType: MessageType.TEXT,
    createdAt: r.createdAt,
  }));
}

/**
 * Extract the text the user should be able to search against. Order
 * matters — TEXT messages return their decrypted body (which the store
 * holds after `decryptStoredMessage`); media types look inside the
 * metadata JSON for the filename. The encrypted X3DH envelope itself
 * is never searched (it's opaque base64).
 */
function extractSearchableText(m: MessageDTO): string {
  if (m.messageType === MessageType.TEXT) {
    // Skip the failure placeholder so it doesn't pollute results.
    const t = m.ciphertext;
    if (t === '[Unable to decrypt message]' || t === '[Unable to decrypt attachment]') return '';
    return t;
  }
  if (
    m.messageType === MessageType.IMAGE
    || m.messageType === MessageType.FILE
    || m.messageType === MessageType.AUDIO
  ) {
    // v0.11.0+ media stores `MediaMetadataV1` (encrypted envelope holds
    // a JSON like `{ v:1, url, k, iv, mime, size, filename?, duration? }`).
    // After decryptStoredMessage runs, `ciphertext` IS that JSON. We
    // index the filename so "report.pdf" finds the attachment.
    try {
      const meta = JSON.parse(m.ciphertext) as { filename?: unknown };
      if (typeof meta.filename === 'string') return meta.filename;
    } catch { /* legacy plaintext / unparseable — skip */ }
    return '';
  }
  return '';
}

function toResultDTO(m: MessageDTO, chat: ChatDTO, currentUserId: string): MessageSearchResultDTO {
  const senderParticipant = chat.participants.find((p) => p.userId === m.senderId);
  const senderName =
    senderParticipant?.user?.displayName
    ?? senderParticipant?.user?.username
    ?? m.senderId;
  const senderAvatarUrl = senderParticipant?.user?.avatarUrl ?? undefined;

  let chatLabel = '';
  let chatAvatarUrl: string | undefined;
  if (chat.type === ChatType.GROUP) {
    chatLabel = chat.title ?? '';
    chatAvatarUrl = chat.avatarUrl ?? undefined;
  } else {
    const other = chat.participants.find((p) => p.userId !== currentUserId);
    chatLabel = other?.user?.displayName ?? other?.user?.username ?? '';
    chatAvatarUrl = other?.user?.avatarUrl ?? undefined;
  }

  // Server-side truncates the snippet at 280 chars; mirror that here so
  // the UI doesn't have to special-case local vs remote hits.
  const snippet = m.ciphertext.length > 280 ? m.ciphertext.slice(0, 280) : m.ciphertext;

  return {
    messageId: m.id,
    chatId: m.chatId,
    chatType: chat.type,
    chatLabel,
    ...(chatAvatarUrl !== undefined && { chatAvatarUrl }),
    senderId: m.senderId,
    senderName,
    ...(senderAvatarUrl !== undefined && { senderAvatarUrl }),
    ciphertext: snippet,
    createdAt: m.createdAt,
  };
}

function sortByCreatedAtDesc(rows: MessageSearchResultDTO[]): MessageSearchResultDTO[] {
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/**
 * v0.13.0 — merge server-side and local hits by messageId, preferring
 * the local entry when both sides return the same message (local has
 * the decrypted plaintext; server only ever has the empty sentinel
 * snippet for encrypted rows). Result is sorted newest-first.
 */
export function mergeSearchResults(
  serverHits: MessageSearchResultDTO[],
  localHits: MessageSearchResultDTO[],
): MessageSearchResultDTO[] {
  const seen = new Set<string>();
  const out: MessageSearchResultDTO[] = [];
  for (const r of localHits) {
    if (seen.has(r.messageId)) continue;
    seen.add(r.messageId);
    out.push(r);
  }
  for (const r of serverHits) {
    if (seen.has(r.messageId)) continue;
    seen.add(r.messageId);
    out.push(r);
  }
  return sortByCreatedAtDesc(out);
}

export function mergeInChatResults(
  serverHits: InChatSearchMatchDTO[],
  localHits: InChatSearchMatchDTO[],
): InChatSearchMatchDTO[] {
  const seen = new Set<string>();
  const out: InChatSearchMatchDTO[] = [];
  for (const r of localHits) {
    if (seen.has(r.messageId)) continue;
    seen.add(r.messageId);
    out.push(r);
  }
  for (const r of serverHits) {
    if (seen.has(r.messageId)) continue;
    seen.add(r.messageId);
    out.push(r);
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
