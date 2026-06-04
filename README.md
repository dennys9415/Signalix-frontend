# Signalix Frontend

**Version: v0.2.0**

Next.js 15 chat client for Signalix. Provides authentication (local + OAuth), real-time messaging, presence, and user profile management.

## Stack

- **Next.js 15** App Router, `output: 'standalone'`
- **React 19**
- **Zustand 5** — client-side state (auth, chats, messages, presence)
- **Tailwind CSS v3**
- **`@signalix/contracts`** — single source of truth for all event names, payload types, and enums

## Architecture

```
Browser  ──HTTP──►   Signalix-api      (auth, chat history, user lookup)
Browser  ──WS──►     Signalix-realtime (live messages, presence, receipts)
```

## Local setup

### Prerequisites

- Node.js 22+
- `Signalix-api` running at `http://localhost:4000`
- `Signalix-realtime` running at `ws://localhost:5000`
- `Signalix-contracts` built (see step 1)

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

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | REST API base URL (default `http://localhost:4000`) |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL (default `ws://localhost:5000`) |

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

### Build

```bash
npm run build   # outputs to .next/
```

## How to use

1. Open `http://localhost:3000` — redirects to `/login` if unauthenticated.
2. **Register** a new account at `/register` (email + username + password).
3. **Or sign in with** Google, GitHub, or Apple via the OAuth buttons on the login page.
4. After login you land on `/chats`.
5. **Search for a user** by typing in the sidebar search bar (partial username match).
6. Click a found user to open a conversation or select an existing chat.
7. Messages are sent over WebSocket. Delivery and read receipts update in real time.
8. **Profile** — click the gear icon in the sidebar or navigate to `/settings/profile`.
9. **Forgot password** — click "Forgot password?" on the login page.
10. **Verify email** — check your inbox after registration; click the link to `/verify-email?token=…`.

## App routes

| Route | Description |
|---|---|
| `/` | Auth-aware redirect (`/chats` or `/login`) |
| `/login` | Login form + Google / GitHub / Apple OAuth buttons |
| `/register` | Registration form |
| `/forgot-password` | Send password reset email |
| `/reset-password` | Reset password via emailed token |
| `/oauth/callback` | Handles OAuth redirect from API; stores session, redirects to `/chats` |
| `/verify-email` | Verifies email token from link; shows success or error state |
| `/chats` | Empty-state / new conversation composer |
| `/chats/[chatId]` | Message view for a specific chat |
| `/settings/profile` | Read-only profile: avatar, display name, email, user ID, connected providers, verification status, logout |

## Project structure

```
src/
  lib/
    api-client.ts         # Typed REST calls; auto-refresh on 401
    token-storage.ts      # localStorage session persistence
    ws-client.ts          # WebSocket singleton; auto-reconnect after 3 s
  store/
    auth.store.ts         # Zustand: session, login, register, loginWithOAuth, logout
    chat.store.ts         # Zustand: chats, messages, presence, WS event handler
  app/
    layout.tsx            # Root HTML layout + Tailwind globals
    page.tsx              # Auth-aware redirect
    login/page.tsx        # Login form + OAuth buttons + error display
    register/page.tsx     # Registration form
    forgot-password/      # Forgot password form
    reset-password/       # Reset password form (reads ?token)
    oauth/callback/       # OAuth session hydration (reads URL params)
    verify-email/         # Email verification (reads ?token)
    chats/
      layout.tsx          # Auth guard + WS lifecycle + two-pane shell
      page.tsx            # Empty state / new conversation composer
      [chatId]/page.tsx   # Message view for a specific chat
    settings/
      profile/page.tsx    # User profile page
  components/
    ChatSidebar.tsx       # Profile strip, chat list, user search
    ChatItem.tsx          # Single chat row (display name + @username + presence dot)
    MessageView.tsx       # Message list, header, scroll, auto read-mark, delete-for-me
    MessageInput.tsx      # Textarea + send button (Enter to send)
    StatusIcon.tsx        # ○ / ✓ / ✓✓ / ✓✓(blue) for message state
    PresenceIndicator.tsx # Green / grey dot
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

## v0.2.0 changelog

### Added
- **Google, GitHub, Apple OAuth** — buttons on `/login`; `/oauth/callback` page handles the redirect from the API
- **Password reset** — `/forgot-password` and `/reset-password` pages
- **Email verification** — `/verify-email` page (success / error states); profile page shows verified / unverified badge; resend button for local-auth users
- **Partial username search** — sidebar search now uses `GET /users/search` for contains-match results
- **Delete for me** — trash icon on hover in message bubbles; filtered from local state on confirm
- **Profile page** — `/settings/profile`: initials avatar, display name, @username, email, user ID, connected providers, logout
- **Sidebar profile strip** — top of sidebar shows initials avatar, display name, @username; links to profile page
- **Display name UI** — `displayName` shown as primary name throughout; `@username` as secondary
- **Initials avatar** — derived from `displayName ?? username`

### Fixed
- **Auth persistence** — Zustand store hydrates from localStorage; no flash of unauthenticated state on reload
- **Message deduplication** — duplicate `server.message.new` events no longer insert the same message twice
- **New chat realtime updates** — `server.message.new` for an unknown `chatId` triggers a chat list refresh immediately
- **Chat refresh stability** — `useRef` guard prevents `loadChats` and WebSocket init from re-firing on navigation

## Known limitations

- **No E2EE.** The `ciphertext` field is stored and transmitted as plain text.
- **No group chats.** Direct messages only.
- **No media.** Text messages only.
- **No offline message queue.** Messages sent while the WebSocket is disconnected are lost. The server auto-reconnects after 3 s but the send is not retried.
- **Routing cache resets on server restart.** If `Signalix-realtime` restarts, the in-memory chat routing cache is empty until clients reconnect. Missed messages are recovered by reloading the page.
- **`NEXT_PUBLIC_*` URLs are build-time constants.** They cannot be changed without rebuilding the image.

## Planned

- Message editing
- Delete for everyone
- Group chats
- Media attachments
- Push notification integration
- Signal Protocol / E2EE
