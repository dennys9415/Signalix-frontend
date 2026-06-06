'use client';

import { create } from 'zustand';
import type {
  ChatDTO,
  MessageDTO,
  PresenceEventPayload,
  PublicUserDTO,
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
import * as api from '../lib/api-client';
import { wsClient } from '../lib/ws-client';
import { playNotificationSound, showBrowserNotification } from '../lib/notification';
import { useAuthStore } from './auth.store';

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
  updateGroupChat: (chatId: string, title: string) => Promise<void>;
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

        set((s) => {
          const existing = s.messages[p.chatId] ?? [];
          const alreadyHave = existing.some((m) => 'id' in m && m.id === p.messageId);
          if (alreadyHave) return s;

          const msg: MessageDTO = {
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
          };

          return {
            messages: { ...s.messages, [p.chatId]: [...existing, msg] },
            // Only count as unread when the user isn't looking at this chat.
            unreadCounts: isActiveChat
              ? s.unreadCounts
              : { ...s.unreadCounts, [p.chatId]: (s.unreadCounts[p.chatId] ?? 0) + 1 },
          };
        });

        wsClient.sendMessageDelivered({ messageId: p.messageId, chatId: p.chatId });

        if (isActiveChat) get().markChatRead(p.chatId);
        if (isNewChat) void get().loadChats();

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
          } else if (p.messageType === MessageType.FILE) {
            try {
              const f = JSON.parse(p.ciphertext) as { name?: string };
              preview = `📎 ${f.name ?? 'File'}`;
            } catch { preview = '📎 File'; }
          } else {
            preview = p.ciphertext;
          }

          showBrowserNotification(senderName, preview, { icon: avatarUrl, chatId: p.chatId });
        }
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
      set((s) => ({
        messages: { ...s.messages, [chatId]: [...messages].reverse() },
        loadingMessages: { ...s.loadingMessages, [chatId]: false },
      }));
    } catch {
      set((s) => ({ loadingMessages: { ...s.loadingMessages, [chatId]: false } }));
    }
  },

  sendMessage({ chatId, recipientUsername, ciphertext, replyToMessageId, isForwarded, messageType }) {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

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

    const resolvedType = (messageType ?? MessageType.TEXT) as MessageType.TEXT | MessageType.IMAGE | MessageType.FILE;

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
    wsClient.sendMessageSend({ chatId: wsChatId, recipientUsername, ciphertext, messageType: resolvedType, tempId, replyToMessageId, isForwarded });
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
    // Optimistic: update content immediately
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
    wsClient.sendMessageEdit({ messageId, chatId, ciphertext });
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

  async updateGroupChat(chatId, title) {
    const { title: newTitle } = await api.updateGroupChat(chatId, { title });
    set((s) => ({
      chats: s.chats.map((c) => c.id === chatId ? { ...c, title: newTitle } : c),
    }));
  },
}));
