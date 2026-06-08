'use client';

import { create } from 'zustand';
import type {
  ChatDTO,
  GroupRecipientPayloadDTO,
  MessageDTO,
  PresenceEventPayload,
  PublicUserDTO,
  ServerChatCreatedPayload,
  ServerMessageDeletedForEveryonePayload,
  ServerMessageEditedPayload,
  ServerMessageNewPayload,
  ServerMessageReactionUpdatedPayload,
  ServerMessageSentPayload,
  MessageStatusPayload,
  TypingPayload,
} from '@signalix/contracts';
import { ChatType, MessageStatus, MessageType, ParticipantRole, PresenceStatus, ServerEvent } from '@signalix/contracts';

export const DRAFT_PREFIX = 'draft:';

// [signalix-crypto] diagnostic logs gated dev-only. See `signal.service.ts`
// for the rationale on routing through a runtime constant instead of
// `process.env.NODE_ENV !== 'production'` checks at each call site.
const CRYPTO_DEBUG_LOGS = process.env.NODE_ENV !== 'production';
import * as api from '../lib/api-client';
import { wsClient } from '../lib/ws-client';
import { playNotificationSound, showBrowserNotification } from '../lib/notification';
import { useAuthStore } from './auth.store';
import { cryptoService, DECRYPT_FAILED_PLACEHOLDER } from '../lib/crypto/crypto.service';
import {
  cacheDecryptFailure,
  cachePlaintext,
  isDecryptFailureCached,
  lookupPlaintext,
} from '../lib/crypto/plaintext-cache';

export interface TempMessage {
  tempId: string;
  chatId?: string;
  ciphertext: string;
  messageType?: MessageType;
  createdAt: string;
  pending: true;
  replyTo?: import('@signalix/contracts').ReplyPreviewDTO;
  isForwarded?: boolean;
}

export type StoredMessage = MessageDTO | TempMessage;

interface ChatState {
  chats: ChatDTO[];
  messages: Record<string, StoredMessage[]>; // chatId → oldest-first
  presence: Record<string, 'online' | 'offline'>; // userId → status
  lastSeenAt: Record<string, string>; // userId → ISO timestamp of last offline
  unreadCounts: Record<string, number>; // chatId → count
  typing: Record<string, string[]>; // chatId → userIds currently typing
  activeChatId: string | null; // the chat currently open
  currentDraft: ChatDTO | null; // the in-memory draft (not persisted, not in DB)
  pendingRecipient: PublicUserDTO | null;
  pendingChatId: string | null;
  loadingChats: boolean;
  loadingMessages: Record<string, boolean>;

  initWsHandler: () => void;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  sendMessage: (payload: { chatId?: string; recipientUsername?: string; ciphertext: string; replyToMessageId?: string; isForwarded?: boolean; messageType?: MessageType }) => void;
  markRead: (chatId: string, messageId: string) => void;
  deleteChatForMe: (chatId: string) => Promise<void>;
  deleteMessageForMe: (chatId: string, messageId: string) => Promise<void>;
  deleteMessageForEveryone: (chatId: string, messageId: string) => void;
  editMessage: (chatId: string, messageId: string, ciphertext: string) => void;
  setReaction: (chatId: string, messageId: string, emoji: string) => void;
  removeReaction: (chatId: string, messageId: string) => void;
  openDraftChat: (user: PublicUserDTO) => string;
  removeDraftChat: (draftId: string) => void;
  setPendingRecipient: (user: PublicUserDTO | null) => void;
  clearPendingChatId: () => void;
  setPresence: (userId: string, status: 'online' | 'offline') => void;
  setActiveChatId: (chatId: string | null) => void;
  markChatRead: (chatId: string) => void;
  clearUnread: (chatId: string) => void;
  createGroupChat: (title: string, memberIds: string[]) => Promise<string>;
  addGroupMembers: (chatId: string, userIds: string[]) => Promise<void>;
  removeGroupMember: (chatId: string, userId: string) => Promise<void>;
  updateGroupChat: (chatId: string, patch: { title?: string; description?: string | null }) => Promise<void>;
  uploadGroupAvatar: (chatId: string, file: File) => Promise<void>;
  removeGroupAvatar: (chatId: string) => Promise<void>;
  transferGroupOwnership: (chatId: string, newOwnerId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messages: {},
  presence: {},
  lastSeenAt: {},
  unreadCounts: {},
  typing: {},
  activeChatId: null,
  currentDraft: null,
  pendingRecipient: null,
  pendingChatId: null,
  loadingChats: false,
  loadingMessages: {},

  initWsHandler() {
    wsClient.setHandler((event, payload) => {
      const state = get();

      if (event === ServerEvent.MESSAGE_SENT) {
        const p = payload as ServerMessageSentPayload;
        set((s) => {
          // Locate the tempId — when sending the first message from a draft
          // chat, it lives in messages["draft:<userId>"], not in messages[realId].
          let sourceChatId = p.chatId;
          if (p.tempId) {
            for (const [cid, msgs] of Object.entries(s.messages)) {
              if (cid === p.chatId) continue;
              if (msgs.some((m) => 'tempId' in m && m.tempId === p.tempId)) {
                sourceChatId = cid;
                break;
              }
            }
          }
          const isMigration = sourceChatId !== p.chatId;

          const promote = (msgs: StoredMessage[]): StoredMessage[] =>
            p.tempId
              ? msgs.map((m) => {
                  if (!('tempId' in m) || m.tempId !== p.tempId) return m;
                  const tmp = m as TempMessage;
                  // Cache sender plaintext so a later history reload can
                  // display the message we just sent (we encrypted it for
                  // the recipient's keys, not our own, so we can't decrypt
                  // it from the server's row).
                  if (tmp.messageType === MessageType.TEXT) {
                    void cachePlaintext(p.messageId, p.chatId, tmp.ciphertext);
                  }
                  const confirmed: MessageDTO = {
                    id: p.messageId,
                    chatId: p.chatId,
                    senderId: p.senderId,
                    ciphertext: tmp.ciphertext,
                    messageType: (tmp.messageType ?? MessageType.TEXT) as MessageType,
                    state: 'sent' as never,
                    createdAt: p.timestamp,
                    ...(tmp.replyTo && { replyTo: tmp.replyTo }),
                    ...(tmp.isForwarded && { isForwarded: true }),
                    ...(p.linkPreview && { linkPreview: p.linkPreview }),
                  };
                  return confirmed;
                })
              : msgs;

          let nextMessages: Record<string, StoredMessage[]>;
          if (isMigration) {
            // Move promoted messages out of the draft bucket into the real chat
            // bucket so they don't vanish when the draft is removed.
            const promoted = promote(s.messages[sourceChatId] ?? []);
            const existing = s.messages[p.chatId] ?? [];
            const { [sourceChatId]: _drop, ...rest } = s.messages;
            nextMessages = { ...rest, [p.chatId]: [...existing, ...promoted] };
          } else {
            nextMessages = { ...s.messages, [p.chatId]: promote(s.messages[p.chatId] ?? []) };
          }

          return {
            messages: nextMessages,
            // Only fire the draft→real navigation on migration. Subsequent sends
            // in an already-real chat must not retrigger pendingChatId.
            pendingChatId: isMigration ? p.chatId : s.pendingChatId,
          };
        });
      }

      if (event === ServerEvent.MESSAGE_NEW) {
        const p = payload as ServerMessageNewPayload;
        const isNewChat = !state.chats.some((c) => c.id === p.chatId);
        const isActiveChat = state.activeChatId === p.chatId;

        // Build the raw MessageDTO with envelope metadata copied through
        // (server-side envelope fields are additive in v0.8.0+ payloads).
        const rawMsg: MessageDTO = {
          id: p.messageId,
          chatId: p.chatId,
          senderId: p.senderId,
          ciphertext: p.ciphertext,
          messageType: p.messageType,
          state: 'delivered' as never,
          createdAt: p.timestamp,
          ...(p.replyTo && { replyTo: p.replyTo }),
          ...(p.isForwarded && { isForwarded: true }),
          ...(p.linkPreview && { linkPreview: p.linkPreview }),
          ...(p.encryptionVersion !== undefined && { encryptionVersion: p.encryptionVersion }),
          ...(p.senderDeviceId !== undefined && { senderDeviceId: p.senderDeviceId }),
          ...(p.recipientDeviceId !== undefined && { recipientDeviceId: p.recipientDeviceId }),
          ...(p.preKeyId !== undefined && { preKeyId: p.preKeyId }),
          ...(p.signedPreKeyId !== undefined && { signedPreKeyId: p.signedPreKeyId }),
        };

        // Delivery receipt + chat-read + new-chat side effects don't depend on
        // the message body, so fire them immediately (don't wait for decrypt).
        wsClient.sendMessageDelivered({ messageId: p.messageId, chatId: p.chatId });
        if (isActiveChat) get().markChatRead(p.chatId);
        if (isNewChat) void get().loadChats();

        // For encrypted TEXT messages, decrypt BEFORE inserting into the
        // store. Without this, the bubble would render the raw envelope
        // JSON for ~50ms until the async decrypt finishes and replaces it
        // with plaintext — a visible flash of base64 garbage. Local decrypt
        // is sub-millisecond, so the added latency before the bubble
        // appears is imperceptible.
        const isEncryptedText =
          !!rawMsg.encryptionVersion
          && rawMsg.encryptionVersion >= 1
          && rawMsg.messageType === MessageType.TEXT;

        const insertAndNotify = async (): Promise<void> => {
          const finalMsg = isEncryptedText ? await decryptStoredMessage(rawMsg) : rawMsg;

          set((s) => {
            const existing = s.messages[p.chatId] ?? [];
            const alreadyHave = existing.some((m) => 'id' in m && m.id === p.messageId);
            if (alreadyHave) return s;
            return {
              messages: { ...s.messages, [p.chatId]: [...existing, finalMsg] },
              // Only count as unread when the user isn't looking at this chat.
              unreadCounts: isActiveChat
                ? s.unreadCounts
                : { ...s.unreadCounts, [p.chatId]: (s.unreadCounts[p.chatId] ?? 0) + 1 },
            };
          });

          // Notify when: not the sender's own message AND (chat is not active OR tab is hidden).
          const currentUserId = useAuthStore.getState().session?.userId ?? '';
          const isOwnMessage = p.senderId === currentUserId;
          const isDocHidden = typeof document !== 'undefined' && document.hidden;

          if (!isOwnMessage && (!isActiveChat || isDocHidden)) {
            playNotificationSound();

            const chat = state.chats.find((c) => c.id === p.chatId);
            const participant = chat?.participants.find((pt) => pt.userId === p.senderId);
            const senderName =
              participant?.user?.displayName ??
              participant?.user?.username ??
              'New message';
            const avatarUrl = participant?.user?.avatarUrl ?? undefined;

            let preview: string;
            if (p.messageType === MessageType.IMAGE) {
              preview = '📷 Photo';
            } else if (p.messageType === MessageType.AUDIO) {
              preview = '🎙️ Voice message';
            } else if (p.messageType === MessageType.FILE) {
              try {
                const f = JSON.parse(p.ciphertext) as { name?: string };
                preview = `📎 ${f.name ?? 'File'}`;
              } catch { preview = '📎 File'; }
            } else {
              // Use the decrypted plaintext for E2EE text — the raw envelope
              // is unreadable garbage as a preview. Falls back to placeholder
              // when decrypt failed.
              preview = finalMsg.ciphertext;
            }

            showBrowserNotification(senderName, preview, { icon: avatarUrl, chatId: p.chatId });
          }
        };

        void insertAndNotify();
      }

      if (event === ServerEvent.MESSAGE_DELIVERED || event === ServerEvent.MESSAGE_READ) {
        const p = payload as MessageStatusPayload;
        set((s) => {
          const chatMsgs = s.messages[p.chatId];
          if (!chatMsgs) return s;
          const newState = p.status === MessageStatus.READ ? 'read' : 'delivered';
          const idx = chatMsgs.findIndex((m) => 'id' in m && m.id === p.messageId);
          if (idx === -1) return s;
          const target = chatMsgs[idx];
          if ('state' in target && target.state === newState) return s;
          const updated = chatMsgs.map((m, i) =>
            i === idx ? ({ ...m, state: newState } as MessageDTO) : m,
          );
          return { messages: { ...s.messages, [p.chatId]: updated } };
        });
      }

      if (event === ServerEvent.MESSAGE_DELETED_FOR_EVERYONE) {
        const p = payload as ServerMessageDeletedForEveryonePayload;
        set((s) => {
          const chatMsgs = s.messages[p.chatId];
          if (!chatMsgs) return s;
          const idx = chatMsgs.findIndex((m) => 'id' in m && m.id === p.messageId);
          if (idx === -1) return s;
          const updated = chatMsgs.map((m, i) =>
            i === idx ? ({ ...m, ciphertext: '', deletedAt: p.deletedAt } as MessageDTO) : m,
          );
          return { messages: { ...s.messages, [p.chatId]: updated } };
        });
      }

      if (event === ServerEvent.MESSAGE_EDITED) {
        const p = payload as ServerMessageEditedPayload;
        set((s) => {
          const chatMsgs = s.messages[p.chatId];
          if (!chatMsgs) return s;
          const idx = chatMsgs.findIndex((m) => 'id' in m && m.id === p.messageId);
          if (idx === -1) return s;
          const updated = chatMsgs.map((m, i) =>
            i === idx ? ({ ...m, ciphertext: p.ciphertext, editedAt: p.editedAt } as MessageDTO) : m,
          );
          return { messages: { ...s.messages, [p.chatId]: updated } };
        });
      }

      if (event === ServerEvent.MESSAGE_REACTION_UPDATED) {
        const p = payload as ServerMessageReactionUpdatedPayload;
        set((s) => {
          const chatMsgs = s.messages[p.chatId];
          if (!chatMsgs) return s;
          const idx = chatMsgs.findIndex((m) => 'id' in m && m.id === p.messageId);
          if (idx === -1) return s;
          const updated = chatMsgs.map((m, i) =>
            i === idx ? ({ ...m, reactions: p.reactions } as MessageDTO) : m,
          );
          return { messages: { ...s.messages, [p.chatId]: updated } };
        });
      }

      if (event === ServerEvent.TYPING_START) {
        const p = payload as TypingPayload;
        set((s) => {
          const current = s.typing[p.chatId] ?? [];
          if (current.includes(p.userId)) return s;
          return { typing: { ...s.typing, [p.chatId]: [...current, p.userId] } };
        });
      }

      if (event === ServerEvent.TYPING_STOP) {
        const p = payload as TypingPayload;
        set((s) => {
          const current = s.typing[p.chatId];
          if (!current?.includes(p.userId)) return s;
          const next = current.filter((id) => id !== p.userId);
          return { typing: { ...s.typing, [p.chatId]: next } };
        });
      }

      if (event === ServerEvent.CHAT_CREATED) {
        const p = payload as ServerChatCreatedPayload;
        // Dedupe by chat id: the creator also receives this event and
        // already inserted the chat from the REST response. New chat
        // goes to the top of the list (matches createGroupChat's local
        // insert order). unreadCount on a brand-new chat is 0.
        set((s) => {
          if (s.chats.some((c) => c.id === p.chat.id)) return s;
          return {
            chats: [p.chat, ...s.chats],
            unreadCounts: { ...s.unreadCounts, [p.chat.id]: p.chat.unreadCount ?? 0 },
          };
        });
      }

      if (event === ServerEvent.USER_ONLINE) {
        const p = payload as PresenceEventPayload;
        set((s) => ({ presence: { ...s.presence, [p.userId]: 'online' } }));
      }

      if (event === ServerEvent.USER_OFFLINE) {
        const p = payload as PresenceEventPayload;
        set((s) => ({
          presence: { ...s.presence, [p.userId]: 'offline' },
          lastSeenAt: { ...s.lastSeenAt, [p.userId]: p.timestamp },
        }));
      }
    });
  },

  async loadChats() {
    set({ loadingChats: true });
    try {
      const { chats } = await api.getChats();
      set((s) => ({
        // Preserve in-memory draft chats — they must survive a reload triggered
        // by incoming messages or other events while the user is composing.
        chats: [...s.chats.filter((c) => c.id.startsWith(DRAFT_PREFIX)), ...chats],
        loadingChats: false,
        unreadCounts: chats.reduce<Record<string, number>>((acc, c) => {
          acc[c.id] = s.unreadCounts[c.id] ?? c.unreadCount ?? 0;
          return acc;
        }, {}),
      }));

      // Fetch initial presence (best-effort — does not affect loadingChats on failure).
      const selfId = useAuthStore.getState().session?.userId ?? '';
      const contactIds = [
        ...new Set(
          chats
            .flatMap((c) => c.participants.map((p) => p.userId))
            .filter((id) => id !== selfId),
        ),
      ];
      if (contactIds.length > 0) {
        try {
          const { presence: presenceList } = await api.getPresence(contactIds);
          set((s) => {
            const newPresence: Record<string, 'online' | 'offline'> = { ...s.presence };
            const newLastSeen: Record<string, string> = { ...s.lastSeenAt };
            for (const p of presenceList) {
              newPresence[p.userId] = p.status === PresenceStatus.ONLINE ? 'online' : 'offline';
              if (p.status !== PresenceStatus.ONLINE) {
                newLastSeen[p.userId] = p.lastSeen;
              }
            }
            return { presence: newPresence, lastSeenAt: newLastSeen };
          });
        } catch { /* presence is non-critical */ }
      }
    } catch {
      set({ loadingChats: false });
    }
  },

  async loadMessages(chatId) {
    if (chatId.startsWith(DRAFT_PREFIX)) return; // draft has no DB messages
    if (get().loadingMessages[chatId]) return;
    set((s) => ({ loadingMessages: { ...s.loadingMessages, [chatId]: true } }));
    try {
      const { messages } = await api.getMessages(chatId, { limit: 50 });
      // v0.9.0 E2EE beta: resolve plaintext for any encrypted direct-text
      // messages before they hit the store. Non-encrypted messages and
      // non-TEXT types pass through unchanged.
      const decrypted = await decryptStoredMessages(messages);
      set((s) => ({
        messages: { ...s.messages, [chatId]: [...decrypted].reverse() },
        loadingMessages: { ...s.loadingMessages, [chatId]: false },
      }));
    } catch {
      set((s) => ({ loadingMessages: { ...s.loadingMessages, [chatId]: false } }));
    }
  },

  sendMessage({ chatId, recipientUsername, ciphertext, replyToMessageId, isForwarded, messageType }) {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const currentUserId = useAuthStore.getState().session?.userId ?? '';

    // Resolve reply preview from store so temp message renders immediately
    let replyTo: import('@signalix/contracts').ReplyPreviewDTO | undefined;
    if (replyToMessageId && chatId) {
      const chatMsgs = get().messages[chatId] ?? [];
      const target = chatMsgs.find((m) => 'id' in m && m.id === replyToMessageId);
      if (target && 'ciphertext' in target && !('deletedAt' in target && target.deletedAt)) {
        replyTo = {
          messageId: replyToMessageId,
          senderId: (target as MessageDTO).senderId,
          ciphertext: target.ciphertext,
        };
      }
    }

    // Widened to SendableMessageType so voice notes (MessageType.AUDIO)
    // pass through unchanged instead of being silently coerced to TEXT.
    const resolvedType = (messageType ?? MessageType.TEXT) as import('@signalix/contracts').SendableMessageType;

    const tempMsg: TempMessage = {
      tempId,
      chatId,
      ciphertext,
      messageType: resolvedType,
      createdAt: new Date().toISOString(),
      pending: true,
      ...(replyTo && { replyTo }),
      ...(isForwarded && { isForwarded: true }),
    };

    if (chatId) {
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: [...(s.messages[chatId] ?? []), tempMsg],
        },
      }));
    }

    // Draft chatIds ("draft:<userId>") are frontend-only and not valid UUIDs.
    // The backend must see only recipientUsername so it can create the real
    // direct chat and broadcast MESSAGE_NEW to the recipient.
    const wsChatId = chatId && !chatId.startsWith(DRAFT_PREFIX) ? chatId : undefined;

    // v0.9.0 E2EE beta: try to encrypt direct + TEXT messages. Falls back
    // to plaintext (encryptionVersion: 0) when the recipient hasn't
    // published keys yet, when the crypto service isn't ready, or when
    // any step fails — so transitioning users never lose messages.
    void dispatchSend({
      tempId,
      wsChatId,
      chatId,
      recipientUsername,
      plaintext: ciphertext,
      messageType: resolvedType,
      replyToMessageId,
      isForwarded,
      state: get(),
      currentUserId,
    });
  },

  markRead(chatId, messageId) {
    wsClient.sendMessageRead({ messageId, chatId });
  },

  async deleteChatForMe(chatId) {
    if (!chatId.startsWith(DRAFT_PREFIX)) await api.deleteChatForMe(chatId);
    set((s) => {
      const { [chatId]: _msgs, ...restMessages } = s.messages;
      const { [chatId]: _unread, ...restUnread } = s.unreadCounts;
      return {
        chats: s.chats.filter((c) => c.id !== chatId),
        messages: restMessages,
        unreadCounts: restUnread,
        activeChatId: s.activeChatId === chatId ? null : s.activeChatId,
      };
    });
  },

  async deleteMessageForMe(chatId, messageId) {
    await api.deleteMessageForMe(messageId);
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).filter(
          (m) => !('id' in m) || m.id !== messageId,
        ),
      },
    }));
  },

  deleteMessageForEveryone(chatId, messageId) {
    // Optimistic: replace content with placeholder immediately
    set((s) => {
      const chatMsgs = s.messages[chatId];
      if (!chatMsgs) return s;
      const deletedAt = new Date().toISOString();
      return {
        messages: {
          ...s.messages,
          [chatId]: chatMsgs.map((m) =>
            'id' in m && m.id === messageId
              ? ({ ...m, ciphertext: '', deletedAt } as MessageDTO)
              : m,
          ),
        },
      };
    });
    wsClient.sendMessageDeleteForEveryone({ messageId, chatId });
  },

  editMessage(chatId, messageId, ciphertext) {
    // Optimistic: update content immediately (the user types plaintext, so
    // that's what we render locally regardless of how it ships over the wire).
    const editedAt = new Date().toISOString();
    set((s) => {
      const chatMsgs = s.messages[chatId];
      if (!chatMsgs) return s;
      return {
        messages: {
          ...s.messages,
          [chatId]: chatMsgs.map((m) =>
            'id' in m && m.id === messageId
              ? ({ ...m, ciphertext, editedAt } as MessageDTO)
              : m,
          ),
        },
      };
    });

    void dispatchEdit({
      chatId,
      messageId,
      plaintext: ciphertext,
      currentUserId: useAuthStore.getState().session?.userId ?? '',
      state: useChatStore.getState(),
    });

    // v0.10.0 — cache the new plaintext locally so the sender re-renders
    // it from cache after a refresh (the messages row stores empty
    // ciphertext for group encrypted edits).
    void cachePlaintext(messageId, chatId, ciphertext);
  },

  setReaction(chatId, messageId, emoji) {
    const currentUserId = useAuthStore.getState().session?.userId ?? '';
    set((s) => {
      const chatMsgs = s.messages[chatId];
      if (!chatMsgs) return s;
      return {
        messages: {
          ...s.messages,
          [chatId]: chatMsgs.map((m) => {
            if (!('id' in m) || m.id !== messageId) return m;
            // Remove user from any prior reaction
            const withoutUser = (m.reactions ?? [])
              .map((r) => {
                const ids = r.userIds.filter((id) => id !== currentUserId);
                return { ...r, userIds: ids, count: ids.length };
              })
              .filter((r) => r.count > 0);
            // Add user to the new emoji bucket
            const bucket = withoutUser.find((r) => r.emoji === emoji);
            const reactions = bucket
              ? withoutUser.map((r) =>
                  r.emoji === emoji
                    ? { ...r, userIds: [...r.userIds, currentUserId], count: r.count + 1 }
                    : r,
                )
              : [...withoutUser, { emoji, count: 1, userIds: [currentUserId] }];
            return { ...m, reactions } as MessageDTO;
          }),
        },
      };
    });
    wsClient.sendMessageReactionSet({ messageId, chatId, emoji });
  },

  removeReaction(chatId, messageId) {
    const currentUserId = useAuthStore.getState().session?.userId ?? '';
    set((s) => {
      const chatMsgs = s.messages[chatId];
      if (!chatMsgs) return s;
      return {
        messages: {
          ...s.messages,
          [chatId]: chatMsgs.map((m) => {
            if (!('id' in m) || m.id !== messageId) return m;
            const reactions = (m.reactions ?? [])
              .map((r) => {
                const ids = r.userIds.filter((id) => id !== currentUserId);
                return { ...r, userIds: ids, count: ids.length };
              })
              .filter((r) => r.count > 0);
            return { ...m, reactions } as MessageDTO;
          }),
        },
      };
    });
    wsClient.sendMessageReactionRemove({ messageId, chatId });
  },

  openDraftChat(user) {
    const currentUserId = useAuthStore.getState().session?.userId ?? '';
    const draftId = `${DRAFT_PREFIX}${user.id}`;
    const now = new Date().toISOString();
    const draft: ChatDTO = {
      id: draftId,
      type: ChatType.DIRECT,
      createdBy: currentUserId,
      createdAt: now,
      unreadCount: 0,
      participants: [
        { chatId: draftId, userId: currentUserId, role: ParticipantRole.OWNER, joinedAt: now },
        {
          chatId: draftId,
          userId: user.id,
          role: ParticipantRole.MEMBER,
          joinedAt: now,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName ?? null,
            avatarUrl: user.avatarUrl,
          } as PublicUserDTO,
        },
      ],
    };
    set((s) => ({
      currentDraft: draft,
      chats: [draft, ...s.chats.filter((c) => !c.id.startsWith(DRAFT_PREFIX))],
      messages: { ...s.messages, [draftId]: [] },
      activeChatId: draftId,
      pendingChatId: null,
      pendingRecipient: null,
      unreadCounts: { ...s.unreadCounts, [draftId]: 0 },
    }));
    return draftId;
  },

  removeDraftChat(draftId) {
    set((s) => {
      const { [draftId]: _m, ...restMessages } = s.messages;
      const { [draftId]: _u, ...restUnread } = s.unreadCounts;
      return {
        currentDraft: s.currentDraft?.id === draftId ? null : s.currentDraft,
        chats: s.chats.filter((c) => c.id !== draftId),
        messages: restMessages,
        unreadCounts: restUnread,
        activeChatId: s.activeChatId === draftId ? null : s.activeChatId,
      };
    });
  },

  setPendingRecipient(user) {
    set({ pendingRecipient: user, pendingChatId: null });
  },

  clearPendingChatId() {
    set({ pendingChatId: null, pendingRecipient: null });
  },

  setPresence(userId, status) {
    set((s) => ({ presence: { ...s.presence, [userId]: status } }));
  },

  setActiveChatId(chatId) {
    set({ activeChatId: chatId });
  },

  markChatRead(chatId) {
    set((s) => {
      if (!s.unreadCounts[chatId]) return s;
      return { unreadCounts: { ...s.unreadCounts, [chatId]: 0 } };
    });
    if (!chatId.startsWith(DRAFT_PREFIX)) {
      void api.markChatRead(chatId).catch(() => {});
    }
  },

  clearUnread(chatId) {
    set((s) => {
      if (!s.unreadCounts[chatId]) return s;
      return { unreadCounts: { ...s.unreadCounts, [chatId]: 0 } };
    });
  },

  async createGroupChat(title, memberIds) {
    const { chat } = await api.createGroupChat({ title, memberIds });
    set((s) => ({
      chats: [chat, ...s.chats],
      unreadCounts: { ...s.unreadCounts, [chat.id]: 0 },
    }));
    // v0.10.2 — notify the realtime layer so it can fan
    // `server.chat.created` out to every online participant. Without
    // this, recipients have to refresh to see the new group in their
    // sidebar. Best-effort: the chat exists server-side regardless.
    try { wsClient.sendChatCreated({ chatId: chat.id }); } catch { /* WS may be reconnecting */ }
    return chat.id;
  },

  async addGroupMembers(chatId, userIds) {
    const { participants } = await api.addGroupMembers(chatId, { userIds });
    set((s) => ({
      chats: s.chats.map((c) => c.id === chatId ? { ...c, participants } : c),
    }));
  },

  async removeGroupMember(chatId, userId) {
    await api.removeGroupMember(chatId, userId);
    const currentUserId = useAuthStore.getState().session?.userId ?? '';
    if (userId === currentUserId) {
      // Self-leave: remove chat from store
      set((s) => {
        const { [chatId]: _msgs, ...restMessages } = s.messages;
        const { [chatId]: _unread, ...restUnread } = s.unreadCounts;
        return {
          chats: s.chats.filter((c) => c.id !== chatId),
          messages: restMessages,
          unreadCounts: restUnread,
          activeChatId: s.activeChatId === chatId ? null : s.activeChatId,
        };
      });
    } else {
      // Removed another member: update participants in store
      set((s) => ({
        chats: s.chats.map((c) =>
          c.id === chatId
            ? { ...c, participants: c.participants.filter((p) => p.userId !== userId) }
            : c,
        ),
      }));
    }
  },

  async updateGroupChat(chatId, patch) {
    const result = await api.updateGroupChat(chatId, patch);
    set((s) => ({
      chats: s.chats.map((c) => {
        if (c.id !== chatId) return c;
        const next = { ...c };
        if (result.title !== undefined) next.title = result.title;
        if (result.description !== undefined) {
          // `null` clears the field locally; spread above carried over the old value.
          if (result.description === null) delete next.description;
          else next.description = result.description;
        }
        return next;
      }),
    }));
  },

  async uploadGroupAvatar(chatId, file) {
    const { avatarUrl } = await api.uploadGroupAvatar(chatId, file);
    set((s) => ({
      chats: s.chats.map((c) => c.id === chatId ? { ...c, avatarUrl } : c),
    }));
  },

  async removeGroupAvatar(chatId) {
    await api.removeGroupAvatar(chatId);
    set((s) => ({
      chats: s.chats.map((c) => {
        if (c.id !== chatId) return c;
        const { avatarUrl: _drop, ...rest } = c;
        return rest;
      }),
    }));
  },

  async transferGroupOwnership(chatId, newOwnerId) {
    const { participants } = await api.transferGroupOwnership(chatId, { newOwnerId });
    set((s) => ({
      chats: s.chats.map((c) => c.id === chatId ? { ...c, participants } : c),
    }));
  },
}));

// ── v0.9.0 E2EE helpers ──────────────────────────────────────────────────
//
// All E2EE logic is kept module-local so the store factory above stays
// readable. The helpers fall back to plaintext on any failure so users
// in transition (recipient hasn't published keys yet, crypto service not
// ready, network blip fetching the bundle) keep sending and receiving
// messages instead of seeing errors.

interface DispatchSendArgs {
  tempId: string;
  wsChatId: string | undefined;
  chatId?: string;
  recipientUsername?: string;
  plaintext: string;
  messageType: import('@signalix/contracts').SendableMessageType;
  replyToMessageId?: string;
  isForwarded?: boolean;
  state: ChatState;
  currentUserId: string;
}

/**
 * Resolves the recipient's userId for an outgoing direct-chat message.
 * For drafts we read it off the in-memory `currentDraft`; for real chats
 * we pull it off the chat's `participants`. Returns `undefined` for
 * groups / unknown chats, which causes the send path to skip encryption.
 */
function resolveDirectRecipient(state: ChatState, args: DispatchSendArgs): string | undefined {
  let chat: ChatDTO | undefined;
  if (args.chatId?.startsWith(DRAFT_PREFIX)) {
    chat = state.currentDraft ?? undefined;
  } else if (args.chatId) {
    chat = state.chats.find((c) => c.id === args.chatId);
  }
  if (!chat || chat.type !== ChatType.DIRECT) return undefined;
  const other = chat.participants.find((p) => p.userId !== args.currentUserId);
  return other?.userId;
}

/**
 * v0.10.0 — resolve the recipient userIds for a group encrypted text send.
 * Returns undefined when the chat isn't a group, when it's a draft (we
 * don't have a real chatId yet), or when there are no other participants.
 */
function resolveGroupRecipientIds(state: ChatState, args: DispatchSendArgs): string[] | undefined {
  if (!args.chatId || args.chatId.startsWith(DRAFT_PREFIX)) return undefined;
  const chat = state.chats.find((c) => c.id === args.chatId);
  if (!chat || chat.type !== ChatType.GROUP) return undefined;
  const others = chat.participants
    .map((p) => p.userId)
    .filter((id) => id !== args.currentUserId);
  return others.length > 0 ? others : undefined;
}

async function dispatchSend(args: DispatchSendArgs): Promise<void> {
  // Default envelope = plaintext + version 0 (pre-E2EE wire format).
  let ciphertext = args.plaintext;
  let encryptionVersion: number | undefined;
  let senderDeviceId: string | undefined;
  let recipientDeviceId: string | undefined;
  let preKeyId: number | undefined;
  let signedPreKeyId: number | undefined;
  let recipients: GroupRecipientPayloadDTO[] | undefined;

  // v0.9.0: direct TEXT only. v0.10.0 extends to group TEXT (beta) via
  // per-recipient fan-out. Media, files, voice still flow as plaintext.
  const isEncryptable = args.messageType === MessageType.TEXT;

  if (isEncryptable && cryptoService.isReady()) {
    const directRecipientId = resolveDirectRecipient(args.state, args);
    const groupRecipientIds = resolveGroupRecipientIds(args.state, args);

    if (directRecipientId) {
      // v0.10.0 fix — fan out to every recipient device (Chrome AND Brave,
      // mobile AND desktop, …) instead of picking bundles[0]. The API now
      // accepts `recipients[]` for direct chats too, so this is the same
      // shape as the group path.
      const fanout = await encryptForUser(directRecipientId);
      if (fanout) {
        ciphertext = '';
        encryptionVersion = 1;
        senderDeviceId = fanout.senderDeviceId;
        recipients = fanout.recipients;
      } else if (CRYPTO_DEBUG_LOGS) {
        // eslint-disable-next-line no-console
        console.warn(
          '[signalix-crypto] direct fan-out failed (no devices? bundle invalid?); sending plaintext',
          { directRecipientId },
        );
      }
    } else if (groupRecipientIds) {
      const fanout = await encryptForGroup(args.plaintext, groupRecipientIds);
      if (fanout) {
        ciphertext = '';
        encryptionVersion = 1;
        senderDeviceId = fanout.senderDeviceId;
        recipients = fanout.recipients;
      } else if (CRYPTO_DEBUG_LOGS) {
        // eslint-disable-next-line no-console
        console.warn(
          '[signalix-crypto] group fan-out failed for one or more recipients; sending plaintext',
        );
      }
    }
  }

  async function encryptForUser(
    recipientUserId: string,
  ): Promise<{ senderDeviceId?: string; recipients: GroupRecipientPayloadDTO[] } | null> {
    try {
      const envelopes = await cryptoService.encryptForUserAllDevices(args.plaintext, recipientUserId);
      if (envelopes.length === 0) return null;
      const recipientsOut: GroupRecipientPayloadDTO[] = [];
      let sdi: string | undefined;
      for (const env of envelopes) {
        if (!env.recipientDeviceId || !env.encryptionVersion) return null;
        if (env.senderDeviceId) sdi = env.senderDeviceId;
        recipientsOut.push({
          recipientUserId,
          recipientDeviceId: env.recipientDeviceId,
          ciphertext: env.ciphertext,
          encryptionVersion: env.encryptionVersion,
          ...(env.preKeyId !== undefined && { preKeyId: env.preKeyId }),
          ...(env.signedPreKeyId !== undefined && { signedPreKeyId: env.signedPreKeyId }),
        });
      }
      if (CRYPTO_DEBUG_LOGS) {
        // eslint-disable-next-line no-console
        console.info('[signalix-crypto] direct fan-out built', {
          recipientUserId,
          deviceCount: recipientsOut.length,
          recipientDeviceIds: recipientsOut.map((r) => r.recipientDeviceId),
        });
      }
      return { senderDeviceId: sdi, recipients: recipientsOut };
    } catch (err) {
      if (CRYPTO_DEBUG_LOGS) {
        // eslint-disable-next-line no-console
        console.warn('[signalix-crypto] direct fan-out threw', err);
      }
      return null;
    }
  }

  wsClient.sendMessageSend({
    ...(args.wsChatId !== undefined && { chatId: args.wsChatId }),
    ...(args.recipientUsername !== undefined && { recipientUsername: args.recipientUsername }),
    ciphertext,
    messageType: args.messageType,
    tempId: args.tempId,
    ...(args.replyToMessageId !== undefined && { replyToMessageId: args.replyToMessageId }),
    ...(args.isForwarded !== undefined && { isForwarded: args.isForwarded }),
    ...(encryptionVersion !== undefined && { encryptionVersion }),
    ...(senderDeviceId !== undefined && { senderDeviceId }),
    ...(recipientDeviceId !== undefined && { recipientDeviceId }),
    ...(preKeyId !== undefined && { preKeyId }),
    ...(signedPreKeyId !== undefined && { signedPreKeyId }),
    ...(recipients && { recipients }),
  });
}

interface DispatchEditArgs {
  chatId: string;
  messageId: string;
  plaintext: string;
  currentUserId: string;
  state: ChatState;
}

/**
 * v0.10.0 — edit dispatch. Mirrors `dispatchSend` but routes through
 * `client.message.edit`. For direct E2EE we re-encrypt the body to the
 * recipient; for group encrypted we re-run the fan-out and replace the
 * per-recipient rows server-side.
 */
async function dispatchEdit(args: DispatchEditArgs): Promise<void> {
  let ciphertext = args.plaintext;
  let encryptionVersion: number | undefined;
  let senderDeviceId: string | undefined;
  let recipientDeviceId: string | undefined;
  let preKeyId: number | undefined;
  let signedPreKeyId: number | undefined;
  let recipients: GroupRecipientPayloadDTO[] | undefined;

  if (cryptoService.isReady()) {
    const sendArgs: DispatchSendArgs = {
      chatId: args.chatId,
      wsChatId: args.chatId,
      plaintext: args.plaintext,
      messageType: MessageType.TEXT,
      tempId: args.messageId,
      currentUserId: args.currentUserId,
      state: args.state,
    };
    const directRecipientId = resolveDirectRecipient(args.state, sendArgs);
    const groupRecipientIds = resolveGroupRecipientIds(args.state, sendArgs);

    if (directRecipientId) {
      // v0.10.0 fix — re-fan-out across every recipient device on edit
      // (matches dispatchSend). Without this, editing a message originally
      // encrypted with the v0.9.x single-device path would re-encrypt to
      // bundles[0] only and silently drop the recipient's other devices.
      const fanout = await encryptForGroup(args.plaintext, [directRecipientId]);
      if (fanout) {
        ciphertext = '';
        encryptionVersion = 1;
        senderDeviceId = fanout.senderDeviceId;
        recipients = fanout.recipients;
      } else if (CRYPTO_DEBUG_LOGS) {
        // eslint-disable-next-line no-console
        console.warn('[signalix-crypto] direct edit fan-out failed; sending plaintext');
      }
    } else if (groupRecipientIds) {
      const fanout = await encryptForGroup(args.plaintext, groupRecipientIds);
      if (fanout) {
        ciphertext = '';
        encryptionVersion = 1;
        senderDeviceId = fanout.senderDeviceId;
        recipients = fanout.recipients;
      } else if (CRYPTO_DEBUG_LOGS) {
        // eslint-disable-next-line no-console
        console.warn('[signalix-crypto] group edit fan-out failed; sending plaintext');
      }
    }
  }

  wsClient.sendMessageEdit({
    messageId: args.messageId,
    chatId: args.chatId,
    ciphertext,
    ...(encryptionVersion !== undefined && { encryptionVersion }),
    ...(senderDeviceId !== undefined && { senderDeviceId }),
    ...(recipientDeviceId !== undefined && { recipientDeviceId }),
    ...(preKeyId !== undefined && { preKeyId }),
    ...(signedPreKeyId !== undefined && { signedPreKeyId }),
    ...(recipients && { recipients }),
  });
}

/**
 * v0.10.0 — encrypt the same plaintext separately for each recipient in
 * a group. Returns `null` (and the caller falls back to plaintext) if
 * **any** recipient fails — partial encryption would leak the body to
 * the recipients we did succeed for while the rest see nothing.
 */
async function encryptForGroup(
  plaintext: string,
  recipientUserIds: string[],
): Promise<{ senderDeviceId?: string; recipients: GroupRecipientPayloadDTO[] } | null> {
  try {
    // v0.10.0: each user can have multiple devices (Chrome + Brave + mobile).
    // We encrypt to *every* device of *every* recipient, so the result count
    // is sum(devices). If any one user fails (bundle invalid, no devices,
    // signature mismatch) the whole send falls back to plaintext.
    const perUser = await Promise.all(
      recipientUserIds.map(async (uid) => ({
        uid,
        envelopes: await cryptoService.encryptForUserAllDevices(plaintext, uid),
      })),
    );
    const recipients: GroupRecipientPayloadDTO[] = [];
    let senderDeviceId: string | undefined;
    for (const { uid, envelopes } of perUser) {
      if (envelopes.length === 0) return null;
      for (const env of envelopes) {
        if (!env.recipientDeviceId || !env.encryptionVersion) return null;
        if (env.senderDeviceId) senderDeviceId = env.senderDeviceId;
        recipients.push({
          recipientUserId: uid,
          recipientDeviceId: env.recipientDeviceId,
          ciphertext: env.ciphertext,
          encryptionVersion: env.encryptionVersion,
          ...(env.preKeyId !== undefined && { preKeyId: env.preKeyId }),
          ...(env.signedPreKeyId !== undefined && { signedPreKeyId: env.signedPreKeyId }),
        });
      }
    }
    return { senderDeviceId, recipients };
  } catch (err) {
    if (CRYPTO_DEBUG_LOGS) {
      // eslint-disable-next-line no-console
      console.warn('[signalix-crypto] group fan-out failed', err);
    }
    return null;
  }
}

/**
 * Resolve plaintext for a single message, in order:
 *   1. Sender's local plaintext cache (for own outgoing messages or
 *      previously-decrypted incoming ones).
 *   2. Live decrypt via CryptoService (for incoming messages on first
 *      sight after history reload).
 *   3. Sentinel "[Unable to decrypt message]" when none of the above
 *      recovers the plaintext.
 *
 * Non-encrypted messages (encryptionVersion 0 / undefined) and non-TEXT
 * messages (image / file / voice — not encrypted in v0.9.0) pass through
 * unchanged.
 */
async function decryptStoredMessage(m: MessageDTO): Promise<MessageDTO> {
  const isEncrypted = !!m.encryptionVersion && m.encryptionVersion >= 1;
  if (!isEncrypted) return m;
  if (m.messageType !== MessageType.TEXT) return m;

  const cached = await lookupPlaintext(m.id);
  if (cached !== undefined) return { ...m, ciphertext: cached };

  // v0.9.1: if a prior decrypt for this message already failed, render
  // the placeholder immediately. This stops history-reload from re-running
  // the same broken handshake repeatedly and removes the brief flicker
  // between empty body and the placeholder text. v0.10.0: the cache is
  // cleared on each `cryptoService.init()`, so a transient failure from
  // a previous session auto-heals on the next page load — only persistent
  // failures keep showing the placeholder.
  if (await isDecryptFailureCached(m.id)) {
    if (CRYPTO_DEBUG_LOGS) {
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] decrypt short-circuit (cached failure this session)', {
        messageId: m.id,
      });
    }
    return { ...m, ciphertext: DECRYPT_FAILED_PLACEHOLDER };
  }

  try {
    const plaintext = await cryptoService.decryptIncoming({
      ciphertext: m.ciphertext,
      encryptionVersion: m.encryptionVersion,
      messageId: m.id,
      ...(m.senderDeviceId !== undefined && { senderDeviceId: m.senderDeviceId }),
      ...(m.recipientDeviceId !== undefined && { recipientDeviceId: m.recipientDeviceId }),
      ...(m.preKeyId !== undefined && { preKeyId: m.preKeyId }),
      ...(m.signedPreKeyId !== undefined && { signedPreKeyId: m.signedPreKeyId }),
    });
    // Cache so subsequent reloads skip the decrypt cost — and so a later
    // pre-key rotation can't strand history.
    await cachePlaintext(m.id, m.chatId, plaintext);
    return { ...m, ciphertext: plaintext };
  } catch (err) {
    // The consolidated `[signalix-crypto] decrypt failed` log is emitted
    // inside signal.service.decryptIncoming with the full diagnostic
    // payload (local key inventory etc.). We only persist the failure
    // marker here so subsequent renders short-circuit.
    void cacheDecryptFailure(m.id, m.chatId, (err as Error)?.message);
    return { ...m, ciphertext: DECRYPT_FAILED_PLACEHOLDER };
  }
}

/**
 * Apply `decryptStoredMessage` to a batch and preserve order.
 * Used by `loadMessages` on history reload.
 */
async function decryptStoredMessages(msgs: MessageDTO[]): Promise<MessageDTO[]> {
  return Promise.all(msgs.map(decryptStoredMessage));
}

