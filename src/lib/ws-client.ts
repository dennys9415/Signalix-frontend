import {
  ClientEvent,
  ServerEvent,
  type ClientMessageSendPayload,
  type MessageStatusPayload,
  type ServerMessageNewPayload,
  type ServerMessageSentPayload,
  type WsAuthenticatePayload,
  type WsHeartbeatPayload,
} from '@signalix/contracts';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:5000';

type ServerEventHandler = (event: string, payload: unknown) => void;

class WsClient {
  private socket: WebSocket | null = null;
  private accessToken: string | null = null;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.accessToken = null;
  }

  send(event: string, payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ event, payload }));
  }

  sendMessageSend(payload: ClientMessageSendPayload): void {
    this.send(ClientEvent.MESSAGE_SEND, payload);
  }

  sendMessageDelivered(payload: Pick<MessageStatusPayload, 'messageId' | 'chatId'>): void {
    this.send(ClientEvent.MESSAGE_DELIVERED, payload);
  }

  sendMessageRead(payload: Pick<MessageStatusPayload, 'messageId' | 'chatId'>): void {
    this.send(ClientEvent.MESSAGE_READ, payload);
  }

  sendHeartbeat(): void {
    const p: WsHeartbeatPayload = { timestamp: new Date().toISOString() };
    this.send(ClientEvent.HEARTBEAT, p);
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
  MessageStatusPayload,
};
export { ServerEvent };
