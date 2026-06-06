# Signalix Frontend

**Version: v0.5.0**

Next.js 15 chat client for Signalix. Direct + group chats, text / image / file messages, reactions, replies, forwards, edit, delete-for-me / for-everyone, link previews, typing indicators, presence, avatar upload, draft chat UX, and the full auth stack (local + Google / GitHub / Apple OAuth).

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
5. **Search for a user** in the sidebar (partial username match). Clicking a result opens a **temporary draft chat** (`draft:<userId>`) right away — no DB entry is created. Sending the first message creates the real chat and replaces the draft in place.
6. **Create a group chat** via the group icon in the sidebar header. Add members, rename, leave, or remove members from the group info modal.
7. Messages support **text, images, and file attachments** (paperclip menu in the composer). Each message exposes hover actions for **reply, forward, react, copy, edit (own), delete-for-me, and delete-for-everyone (own)**.
8. Pasting a URL fetches a **link preview** server-side and embeds it in the bubble.
9. **Typing indicators** appear above the composer when the other side is typing.
10. **Profile** — click your avatar in the sidebar or navigate to `/settings/profile`. Upload or remove your avatar from there.
11. **Forgot password** — click "Forgot password?" on the login page.
12. **Verify email** — check your inbox after registration; click the link to `/verify-email?token=…`.

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
| `/chats` | Inbox hub — empty state, or `MessageView` for the active draft chat |
| `/chats/[chatId]` | Message view for a specific real chat (direct or group). Draft IDs are redirected back to `/chats` immediately. |
| `/settings/profile` | Profile: avatar upload / remove, display name, email, user ID, connected providers, verification status, logout |

## Project structure

```
src/
  lib/
    api-client.ts         # Typed REST calls (auth, chats, messages, files, media, profile); auto-refresh on 401
    token-storage.ts      # localStorage session persistence
    ws-client.ts          # WebSocket singleton; auto-reconnect after 3 s
    sidebar-context.tsx   # Mobile two-pane sidebar open/close state
    avatar.ts             # Display name + timestamp formatting helpers
    presence.ts           # formatLastSeen() helper
    notification.ts       # Browser notification + sound
  store/
    auth.store.ts         # Zustand: session, login, register, loginWithOAuth, logout, WS lifecycle
    chat.store.ts         # Zustand: chats, messages, presence, currentDraft, pendingChatId, WS event handler, groups, reactions, edit, delete
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
      page.tsx            # Inbox hub: renders MessageView when currentDraft is active, otherwise empty state
      [chatId]/page.tsx   # Message view for a real chat; redirects draft IDs back to /chats
    settings/
      profile/page.tsx    # Profile page with avatar upload
  components/
    ChatSidebar.tsx       # Profile strip, chat list, user search, draft handling, new-group button
    ChatItem.tsx          # Single chat row; renders <button> for drafts, <Link> for real chats
    MessageView.tsx       # Header, message list, reply / forward / react / edit / delete menus, draft input wiring
    MessageInput.tsx      # Textarea + paperclip (image / file) + send (Enter to send)
    GroupCreateModal.tsx  # Create a new group chat
    GroupInfoModal.tsx    # Group title, members, add / remove, leave
    ContactProfileModal.tsx # Direct chat partner profile
    Avatar.tsx            # Initials avatar with optional URL
    StatusIcon.tsx        # ○ / ✓ / ✓✓ / ✓✓(blue) for message state
    PresenceIndicator.tsx # Green / grey dot
    IconRail.tsx          # Desktop left rail (chats / settings)
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

## v0.5.0 changelog

### Added since v0.2.0
- **Group chats** — create / rename / add members / remove members / leave via sidebar and `GroupInfoModal`; sender name rendered above incoming group bubbles
- **Reactions** — quick-react popover (👍 ❤️ 😂 😮 😢) and chip toggles; one reaction per user per message
- **Reply** — swipe-style reply selector; reply preview shown inside the bubble
- **Forward** — `ForwardModal` lets the user pick any chat as the destination; `isForwarded` flag rendered as a label
- **Edit message** — inline edit textarea on own messages; "Edited" indicator after save
- **Delete for everyone** — sender-only menu item; placeholder bubble shown to all participants
- **Delete chat for me** — removes the chat from the local sidebar; backend stores a per-user visibility cutoff
- **Image and file messages** — paperclip menu uploads via REST then sends a message of `MessageType.IMAGE` / `MessageType.FILE`; previews + download buttons rendered in bubbles
- **Link previews** — `LinkPreviewCard` shown under text bubbles when the server attaches `LinkPreviewDTO`
- **Typing indicators** — `is typing…` line above the composer when other participants type
- **Avatar upload** — profile page lets the user upload or remove their avatar; rendered everywhere via `Avatar`
- **Persistent unread counts** — `unreadCount` from `GET /chats` is preserved; `POST /chats/:chatId/read` clears it server-side
- **Temporary draft chat UX** — selecting a user from search opens a `draft:<userId>` chat in the sidebar with the composer ready; sending the first message creates the real chat and replaces the draft in place. Drafts never touch the database.
- **Browser notifications + sound** — for incoming messages when the chat isn't focused

### v0.5.0 stabilization (fixes)
- New OAuth users no longer inherit provider default avatars (`avatarUrl: null`)
- Reopening a deleted direct chat now correctly creates a fresh history view (cutoff updated on re-delete)
- Restarting a direct chat with a previous group counterpart no longer reopens the group by mistake — sidebar `startNewChat` filters by `ChatType.DIRECT`
- Group bubbles now display the sender's display name above the message
- Chat header dropdown is no longer clipped — stacking context fixed on the header
- First message from a draft no longer omits the recipient: `chat.store.sendMessage` strips the `draft:` chatId before calling `wsClient.sendMessageSend`, so the realtime layer sees only `recipientUsername`. The `MESSAGE_SENT` handler then migrates the temp message from the draft bucket to the real chat bucket.

## Known limitations

- **No E2EE.** The `ciphertext` field is stored and transmitted as plain text.
- **No offline message queue.** Messages sent while the WebSocket is disconnected are lost. The server auto-reconnects after 3 s but the send is not retried.
- **Drafts are in-memory only.** A page refresh while composing a draft drops it.
- **Routing cache resets on server restart.** If `Signalix-realtime` restarts, the in-memory chat routing cache is empty until clients reconnect. Missed messages are recovered by reloading the page.
- **`NEXT_PUBLIC_*` URLs are build-time constants.** They cannot be changed without rebuilding the image.
- **No in-conversation search.** Sidebar search finds users; there is no search within message history.

## Planned

- In-conversation search
- Per-participant read receipts in group chats
- Push notification integration
- Persistent drafts across reloads
- Signal Protocol / E2EE
