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
import { wsClient, ServerEvent as WsServerEvent } from '../lib/ws-client';

export interface TempMessage {
  tempId: string;
  chatId?: string;
  ciphertext: string;
  createdAt: string;
  pending: true;
}

type StoredMessage = MessageDTO | TempMessage;

interface ChatState {
  chats: ChatDTO[];
  messages: Record<string, StoredMessage[]>; // chatId → oldest-first
  presence: Record<string, 'online' | 'offline'>; // userId → status
  pendingRecipient: PublicUserDTO | null;
  pendingChatId: string | null;
  loadingChats: boolean;
  loadingMessages: Record<string, boolean>;

  initWsHandler: () => void;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  sendMessage: (payload: { chatId?: string; recipientUsername?: string; ciphertext: string }) => void;
  markRead: (chatId: string, messageId: string) => void;
  setPendingRecipient: (user: PublicUserDTO | null) => void;
  clearPendingChatId: () => void;
  setPresence: (userId: string, status: 'online' | 'offline') => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messages: {},
  presence: {},
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
          // Replace temp message if tempId present, otherwise append
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
          };
        });
        // Acknowledge delivery
        wsClient.sendMessageDelivered({ messageId: p.messageId, chatId: p.chatId });
      }

      if (event === ServerEvent.MESSAGE_DELIVERED || event === ServerEvent.MESSAGE_READ) {
        const p = payload as MessageStatusPayload;
        set((s) => {
          const chatMsgs = s.messages[p.chatId];
          if (!chatMsgs) return s;
          const updated = chatMsgs.map((m) => {
            if (!('id' in m) || m.id !== p.messageId) return m;
            return { ...m, state: p.status === MessageStatus.READ ? 'read' : 'delivered' } as MessageDTO;
          });
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
      // API returns newest-first; reverse to oldest-first
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

  setPendingRecipient(user) {
    set({ pendingRecipient: user, pendingChatId: null });
  },

  clearPendingChatId() {
    set({ pendingChatId: null });
  },

  setPresence(userId, status) {
    set((s) => ({ presence: { ...s.presence, [userId]: status } }));
  },
}));
