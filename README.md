# Signalix Frontend

Next.js 15 chat client for Signalix v0.1.

## Stack

- **Next.js 15** App Router, `output: 'standalone'`
- **React 19**
- **Zustand 5** — client-side state (auth, chats, messages, presence)
- **Tailwind CSS v3**
- **`@signalix/contracts`** — single source of truth for all event names, payload types, and enums

## Local setup

### Prerequisites

- Node.js 22+
- `Signalix-api` running at `http://localhost:4000`
- `Signalix-realtime` running at `ws://localhost:5000`
- `Signalix-contracts` built (see below)

### 1. Build contracts

```bash
# From the monorepo root (proyect/)
cd Signalix-contracts
npm install
npm run build
cd ..
```

### 2. Configure env

```bash
cd Signalix-frontend
cp .env.example .env.local
```

Edit `.env.local`:

| Variable               | Description                                        |
|------------------------|----------------------------------------------------|
| `NEXT_PUBLIC_API_URL`  | REST API base URL (default `http://localhost:4000`) |
| `NEXT_PUBLIC_WS_URL`   | WebSocket URL (default `ws://localhost:5000`)       |

> **Note:** `NEXT_PUBLIC_*` variables are baked into the JS bundle at build time. Changing them after a build has no effect — you must rebuild.

### 3. Run

```bash
npm install
npm run dev       # http://localhost:3000 (Turbopack)
```

### Typecheck

```bash
npm run typecheck   # tsc --noEmit
```

## How to use

1. Open http://localhost:3000 — redirects to `/login` if unauthenticated.
2. **Register** a new account at `/register`.
3. After login you land on `/chats`.
4. **Search for a user** by exact username using the search bar in the sidebar.
5. Click a found user to open a new conversation, or select an existing chat.
6. Messages are sent over WebSocket. Delivery and read receipts update in real time.

## Project structure

```
src/
  lib/
    api-client.ts       # Typed REST calls; auto-refresh on 401
    token-storage.ts    # localStorage session persistence
    ws-client.ts        # WebSocket singleton; auto-reconnect after 3 s
  store/
    auth.store.ts       # Zustand: session, login, register, logout
    chat.store.ts       # Zustand: chats, messages, presence, WS event handler
  app/
    layout.tsx          # Root HTML layout + Tailwind globals
    page.tsx            # Auth-aware redirect (→ /chats or /login)
    login/page.tsx      # Login form
    register/page.tsx   # Registration form
    chats/
      layout.tsx        # Auth guard + WS lifecycle + two-pane shell
      page.tsx          # Empty state / new conversation composer
      [chatId]/
        page.tsx        # Message view for a specific chat
  components/
    ChatSidebar.tsx     # Chat list + user search
    ChatItem.tsx        # Single chat row with presence dot
    MessageView.tsx     # Message list, header, scroll, auto read-mark
    MessageInput.tsx    # Textarea + send button (Enter to send)
    StatusIcon.tsx      # ○ / ✓ / ✓✓ / ✓✓(blue) for message state
    PresenceIndicator.tsx  # Green / grey dot
```

## Docker

Build from the **monorepo root** (required — Dockerfile needs both `Signalix-contracts/` and `Signalix-frontend/` in build context). The `NEXT_PUBLIC_*` URLs must be passed as build arguments:

```bash
# From proyect/
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 \
  --build-arg NEXT_PUBLIC_WS_URL=ws://localhost:5000 \
  -f Signalix-frontend/Dockerfile \
  -t signalix-frontend .
```

Use `Signalix-infra` Docker Compose for local development — build args are already configured there.

## Known v0.1 limitations

- **No E2EE.** The `ciphertext` field is stored and transmitted as plain text. Signal Protocol is not implemented.
- **No OAuth or password reset.** Accounts require username + email + password.
- **No group chats.** Direct messages only.
- **No media.** Text messages only.
- **No offline message queue.** Messages sent while the WebSocket is disconnected are lost. The server auto-reconnects after 3 s but the send is not retried.
- **Routing cache resets on server restart.** If `Signalix-realtime` restarts, the in-memory chat routing cache is empty until clients reconnect. Missed messages are recovered by reloading the page (which re-fetches history from the API).
- **`NEXT_PUBLIC_*` URLs are build-time constants.** They cannot be changed without rebuilding the image.
