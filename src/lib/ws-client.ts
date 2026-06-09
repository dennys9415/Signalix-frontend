import {
  ClientEvent,
  ServerEvent,
  type ClientChatCreatedPayload,
  type ClientMessageDeleteForEveryonePayload,
  type ClientMessageEditPayload,
  type ClientMessageReactionRemovePayload,
  type ClientMessageReactionSetPayload,
  type ClientMessageSendPayload,
  type MessageStatusPayload,
  type ServerMessageDeletedForEveryonePayload,
  type ServerMessageEditedPayload,
  type ServerMessageNewPayload,
  type ServerMessageReactionUpdatedPayload,
  type ServerMessageSentPayload,
  type WsAuthenticatePayload,
  type WsHeartbeatPayload,
} from '@signalix/contracts';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:5000';

type ServerEventHandler = (event: string, payload: unknown) => void;

const HEARTBEAT_INTERVAL_MS = 30_000;

class WsClient {
  private socket: WebSocket | null = null;
  private accessToken: string | null = null;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private handler: ServerEventHandler | null = null;

  setHandler(handler: ServerEventHandler): void {
    this.handler = handler;
  }

  connect(accessToken: string): void {
    this.accessToken = accessToken;
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.accessToken = null;
  }

  /**
   * v0.14.0 — returns `true` when the frame was handed to the browser
   * for transmission, `false` when the socket is closed/closing. The
   * caller can use this to decide whether to mark the temp message as
   * "queued" until the WS reconnects.
   */
  send(event: string, payload: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ event, payload }));
    return true;
  }

  /** v0.14.0 — `true` iff the underlying socket is OPEN. */
  isConnected(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  sendMessageSend(payload: ClientMessageSendPayload): boolean {
    return this.send(ClientEvent.MESSAGE_SEND, payload);
  }

  sendMessageDelivered(payload: Pick<MessageStatusPayload, 'messageId' | 'chatId'>): void {
    this.send(ClientEvent.MESSAGE_DELIVERED, payload);
  }

  sendMessageRead(payload: Pick<MessageStatusPayload, 'messageId' | 'chatId'>): void {
    this.send(ClientEvent.MESSAGE_READ, payload);
  }

  sendMessageDeleteForEveryone(payload: ClientMessageDeleteForEveryonePayload): void {
    this.send(ClientEvent.MESSAGE_DELETE_FOR_EVERYONE, payload);
  }

  sendMessageEdit(payload: ClientMessageEditPayload): void {
    this.send(ClientEvent.MESSAGE_EDIT, payload);
  }

  sendMessageReactionSet(payload: ClientMessageReactionSetPayload): void {
    this.send(ClientEvent.MESSAGE_REACTION_SET, payload);
  }

  sendMessageReactionRemove(payload: ClientMessageReactionRemovePayload): void {
    this.send(ClientEvent.MESSAGE_REACTION_REMOVE, payload);
  }

  sendHeartbeat(): void {
    const p: WsHeartbeatPayload = { timestamp: new Date().toISOString() };
    this.send(ClientEvent.HEARTBEAT, p);
  }

  sendTypingStart(payload: { chatId: string }): void {
    this.send(ClientEvent.TYPING_START, payload);
  }

  sendTypingStop(payload: { chatId: string }): void {
    this.send(ClientEvent.TYPING_STOP, payload);
  }

  sendChatCreated(payload: ClientChatCreatedPayload): void {
    this.send(ClientEvent.CHAT_CREATED, payload);
  }

  private openSocket(): void {
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }

    const ws = new WebSocket(WS_URL);
    this.socket = ws;

    ws.onopen = () => {
      if (!this.accessToken) return;
      const p: WsAuthenticatePayload = { accessToken: this.accessToken };
      ws.send(JSON.stringify({ event: ClientEvent.AUTHENTICATE, payload: p }));
      // v0.14.0 — keep the connection healthy with a periodic ping so
      // idle proxies don't drop us and the realtime layer's
      // connection-manager sees activity.
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.isConnected()) this.sendHeartbeat();
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      let msg: { event: string; payload: unknown };
      try {
        msg = JSON.parse(ev.data) as { event: string; payload: unknown };
      } catch {
        return;
      }
      this.dispatch(msg.event, msg.payload);
    };

    ws.onclose = () => {
      this.socket = null;
      if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.openSocket(), 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private dispatch(event: string, payload: unknown): void {
    this.handler?.(event, payload);
  }
}

// Singleton — safe to import from any client component
export const wsClient = new WsClient();

// Re-export payload types for consumers
export type {
  ServerMessageSentPayload,
  ServerMessageNewPayload,
  ServerMessageDeletedForEveryonePayload,
  ServerMessageEditedPayload,
  ServerMessageReactionUpdatedPayload,
  MessageStatusPayload,
};
export { ServerEvent };
