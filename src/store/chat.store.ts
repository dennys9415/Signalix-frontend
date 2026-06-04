'use client';

import { create } from 'zustand';
import type {
  ChatDTO,
  MessageDTO,
  PublicUserDTO,
  ServerMessageNewPayload,
  ServerMessageSentPayload,
  MessageStatusPayload,
} from '@signalix/contracts';
import { MessageStatus, ServerEvent } from '@signalix/contracts';
import * as api from '../lib/api-client';
import { wsClient } from '../lib/ws-client';
import { playNotificationSound, showBrowserNotification } from '../lib/notification';

export interface TempMessage {
  tempId: string;
  chatId?: string;
  ciphertext: string;
  createdAt: string;
  pending: true;
}

export type StoredMessage = MessageDTO | TempMessage;

interface ChatState {
  chats: ChatDTO[];
  messages: Record<string, StoredMessage[]>; // chatId → oldest-first
  presence: Record<string, 'online' | 'offline'>; // userId → status
  unreadCounts: Record<string, number>; // chatId → count
  activeChatId: string | null; // the chat currently open
  pendingRecipient: PublicUserDTO | null;
  pendingChatId: string | null;
  loadingChats: boolean;
  loadingMessages: Record<string, boolean>;

  initWsHandler: () => void;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  sendMessage: (payload: { chatId?: string; recipientUsername?: string; ciphertext: string }) => void;
  markRead: (chatId: string, messageId: string) => void;
  deleteMessageForMe: (chatId: string, messageId: string) => Promise<void>;
  setPendingRecipient: (user: PublicUserDTO | null) => void;
  clearPendingChatId: () => void;
  setPresence: (userId: string, status: 'online' | 'offline') => void;
  setActiveChatId: (chatId: string | null) => void;
  clearUnread: (chatId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messages: {},
  presence: {},
  unreadCounts: {},
  activeChatId: null,
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
          const chatMsgs = s.messages[p.chatId] ?? [];
          const updated = p.tempId
            ? chatMsgs.map((m) =>
                'tempId' in m && m.tempId === p.tempId
                  ? ({
                      id: p.messageId,
                      chatId: p.chatId,
                      senderId: p.senderId,
                      ciphertext: (m as TempMessage).ciphertext,
                      messageType: 'text' as never,
                      state: 'sent' as never,
                      createdAt: p.timestamp,
                    } satisfies MessageDTO)
                  : m,
              )
            : chatMsgs;
          return {
            messages: { ...s.messages, [p.chatId]: updated },
            pendingChatId: s.pendingChatId ?? (p.chatId !== undefined ? p.chatId : null),
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

        if (isNewChat) void get().loadChats();

        // Notifications for messages arriving in a chat the user is not viewing.
        if (!isActiveChat) {
          playNotificationSound();

          // Resolve sender name from already-loaded chat participants.
          const chat = state.chats.find((c) => c.id === p.chatId);
          const participant = chat?.participants.find((pt) => pt.userId === p.senderId);
          const senderName =
            participant?.user?.displayName ??
            participant?.user?.username ??
            'New message';

          showBrowserNotification(senderName, p.ciphertext);
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

      if (event === ServerEvent.USER_ONLINE) {
        const p = payload as { userId: string };
        set((s) => ({ presence: { ...s.presence, [p.userId]: 'online' } }));
      }

      if (event === ServerEvent.USER_OFFLINE) {
        const p = payload as { userId: string };
        set((s) => ({ presence: { ...s.presence, [p.userId]: 'offline' } }));
      }
    });
  },

  async loadChats() {
    set({ loadingChats: true });
    try {
      const { chats } = await api.getChats();
      set({ chats, loadingChats: false });
    } catch {
      set({ loadingChats: false });
    }
  },

  async loadMessages(chatId) {
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

  sendMessage({ chatId, recipientUsername, ciphertext }) {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const tempMsg: TempMessage = {
      tempId,
      chatId,
      ciphertext,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    if (chatId) {
      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: [...(s.messages[chatId] ?? []), tempMsg],
        },
      }));
    }

    wsClient.sendMessageSend({ chatId, recipientUsername, ciphertext, messageType: 'text' as never, tempId });
  },

  markRead(chatId, messageId) {
    wsClient.sendMessageRead({ messageId, chatId });
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

  clearUnread(chatId) {
    set((s) => {
      if (!s.unreadCounts[chatId]) return s; // already zero — no re-render
      return { unreadCounts: { ...s.unreadCounts, [chatId]: 0 } };
    });
  },
}));
