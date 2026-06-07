# Signalix Frontend

**Version: v0.9.0**

Next.js 15 chat client for Signalix. Direct + group chats, text / image / file / **voice note** messages, reactions, replies, forwards, edit, delete-for-me / for-everyone, link previews, typing indicators, presence, avatar upload, draft chat UX, and the full auth stack (local + Google / GitHub / Apple OAuth). Installable as a Progressive Web App with Web Push notifications. v0.9.0 turns on **real beta end-to-end encryption for direct text messages** via `src/lib/crypto/signal.service.ts` — X25519 ECDH + AES-256-GCM, keys generated in the browser, stored in IndexedDB, never sent to the server.

> ⚠️ **Beta E2EE — not production-grade.** Direct text messages are encrypted between v0.9.0+ clients. **Groups, images, files, voice notes remain plaintext** on the server (and the receiver-side preview rendering hasn't changed for them). No Double Ratchet, no multi-device fan-out, no server-side signed-pre-key signature verification yet. **v0.10.0** hardens this; v0.11.0+ extends to groups + media. The chat header shows a 🔒 "End-to-end encrypted beta" pill for direct chats; messages that fail to decrypt render as `[Unable to decrypt message]`.

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
    ChatSidebar.tsx              # Profile strip, chat list, user search, draft handling, new-group button
    ChatItem.tsx                 # Single chat row; renders <button> for drafts, <Link> for real chats
    MessageView.tsx              # Header, message list, reply / forward / react / edit / delete menus, draft input wiring
    MessageInput.tsx             # Textarea + paperclip (image / file) + send (Enter to send)
    GroupCreateModal.tsx         # Create a new group chat
    GroupInfoModal.tsx           # Group title, members, add / remove, leave
    ContactProfileModal.tsx      # Direct chat partner profile
    Avatar.tsx                   # Initials avatar with optional URL
    StatusIcon.tsx               # ○ / ✓ / ✓✓ / ✓✓(blue) for message state
    PresenceIndicator.tsx        # Green / grey dot
    IconRail.tsx                 # Desktop left rail (chats / settings)
    ServiceWorkerRegistration.tsx # Registers /sw.js after window load
    InstallPrompt.tsx            # Catches beforeinstallprompt, renders dismissible banner
public/
  manifest.webmanifest    # PWA manifest (name, start_url, icons, theme)
  sw.js                   # Minimal service worker (no API/WS caching)
  icon.svg                # 512×512 standard icon (purpose: any)
  icon-maskable.svg       # 512×512 maskable icon with safe-area padding
  apple-touch-icon.svg    # 180×180 iOS home-screen icon
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

## Progressive Web App (PWA)

Signalix is installable as a PWA. The foundation in v0.6.0 is intentionally minimal — it satisfies browser install criteria but does **not** cache API responses, WebSocket traffic, or message data. Treat the installed app as a thin shell over the network for now.

### How to test locally

1. Start the stack (`Signalix-infra/scripts/up.sh`) and visit `http://localhost:3000`.
2. Open Chrome / Edge DevTools → **Application**:
   - **Manifest** — verify `name`, `start_url=/chats`, `display=standalone`, two icons (any + maskable), and the theme/background colors render.
   - **Service workers** — `/sw.js` should be `activated and is running` with `signalix-pwa-v1` in the source.
3. In the address bar, the install icon should appear (Chrome: ⊕ in the URL bar; Edge: apps icon). Clicking it opens the install dialog.
4. The custom in-app banner appears at the bottom on browsers that fire `beforeinstallprompt`. "Install" forwards to the native dialog; "Not now" is persisted in `localStorage` under `signalix-install-dismissed`.
5. After install, the app launches in a standalone window (no browser chrome). Auth, send/receive, presence, and groups all continue to use the live API / WebSocket.

### How install criteria are met

| Requirement | Where |
|---|---|
| Served over HTTPS or `localhost` | local dev, infra responsibility in prod |
| Web app manifest with `name`, `short_name`, `start_url`, `display`, `icons` | `public/manifest.webmanifest`, linked via `Metadata.manifest` in `app/layout.tsx` |
| Icon ≥ 192×192 in PNG/SVG/WebP | `public/icon.svg` with `sizes: "any"` |
| Registered service worker with a `fetch` handler | `public/sw.js` + `<ServiceWorkerRegistration>` in root layout |
| Theme color | `Viewport.themeColor` per color scheme |

### What the service worker does (and doesn't)

- ✅ Installs and activates cleanly; uses `skipWaiting()` and `clients.claim()` so a new version takes over without a manual reload.
- ✅ Has a `fetch` handler that **explicitly does nothing** for `/api/*` and `ws://` / `wss://` requests — these always hit the network with live auth headers.
- ✅ Pass-through for all other requests (no `event.respondWith()` call → browser handles the request normally).
- ❌ No precache, no runtime cache. Static assets are served by Next.js as usual.
- ❌ No push handler, no background sync, no offline message queue.

### Known limitations

- **SVG icons only.** Some older browsers (pre-Chrome 91 / pre-Safari 16) and some app stores prefer rasterized PNGs. For production, generate 192×192 and 512×512 PNGs from `icon.svg` and add them as additional `icons[]` entries.
- **iOS `apple-touch-icon`** is provided as SVG. iOS Safari renders it on add-to-home-screen but a 180×180 PNG is preferred for older iOS versions.
- **`scope: "/"`** means the SW controls the whole origin — including OAuth callback routes. The fetch handler is pass-through to avoid any interference, but be careful if you add caching later.
- **No offline.** Opening the installed app without connectivity will show a blank load (the SW does not serve a fallback page yet).
- **Install banner is browser-driven.** Safari does not fire `beforeinstallprompt`; users add to home screen via Share → "Add to Home Screen". The custom banner stays hidden in that case.

### Planned (PWA roadmap)

- Rasterized PNG icon variants (192 / 512 / maskable / apple-touch)
- Offline fallback page
- Static asset precaching with versioned cache
- Push notifications (server-side wiring lives in `Signalix-api` / `Signalix-realtime`)
- Background sync for queued sends

## Web Push notifications

Available since v0.6.0. Users receive OS-level notifications when a message arrives **and they're offline** (per the server's `presence.status` check). Configure once in `Settings → Profile → Notifications`; click "Enable Push Notifications" to grant permission and register the device.

### How it flows

1. Settings card calls `enablePush()` (`src/lib/push.ts`).
2. Browser prompts for notification permission.
3. `PushManager.subscribe()` returns endpoint + keys; we POST them to `POST /api/v1/push/subscribe` along with the user's JWT.
4. When someone sends a message and the recipient's `presence.status` is not `online`, the API calls `web-push` for every device subscription on file.
5. The service worker (`public/sw.js`) receives the push, shows an OS notification with sender name, message preview, and avatar.
6. Clicking the notification focuses an existing Signalix window (or opens one) and client-side-navigates to `/chats/:chatId` via `SW → postMessage → router.push` inside `ServiceWorkerRegistration.tsx`.

### Build-time / runtime config

- **No build-arg needed.** The VAPID public key is fetched at runtime from `GET /api/v1/push/public-key`, so the frontend image doesn't need to know it at build time.
- The frontend is fully functional with push disabled — the Notifications card surfaces the right state (`Not supported`, `Blocked`, `Off`, `On`).

### Known limitations

- **iOS Safari ≤ 16.3** does not support Web Push for non-installed PWAs. Users must add Signalix to the home screen first.
- **Per-chat mute, group mute, sound customization, in-app banner suppression while the chat is open** — not implemented in v0.6.
- The "offline" check uses the `presence` table only. If a recipient has the tab open but `presence.status` is stale (e.g. WS dropped without an offline event), they may receive a push even though their browser would have shown an in-app notification too. Acceptable tradeoff while realtime stays untouched.

## Voice messages

Available since v0.6.1. Composer mic button replaces the send button while the textarea is empty; tapping it switches the input row into a recording state with a pulsing red dot, an elapsed timer, cancel and send. Sending uploads the captured blob to MinIO via `POST /api/v1/media/voice` and emits a `MessageType.AUDIO` message whose `ciphertext` carries `JSON.stringify({ url, duration, size })`. The bubble renders through `VoiceBubble.tsx` (play/pause + linear progress + mm:ss).

### Implementation

| Piece | Where |
|---|---|
| Recorder UI + MediaRecorder lifecycle | `components/MessageInput.tsx` — `startRecording`, `cancelRecording`, `finishRecordingAndSend`, mic-permission error surface, mic teardown on unmount |
| Player | `components/VoiceBubble.tsx` — hidden `<audio preload="metadata">` + glass play button + progress track |
| Routing AUDIO inside the bubble | `components/MessageView.tsx` (`isAudio` branch, `VoiceBubbleSection`, `parseVoiceInfo`) |
| Sidebar / notification / reply previews | `🎙️ Voice message` in `ChatItem.tsx`, `chat.store.ts` notification handler, `MessageView.getReplyPreviewText` |
| API client | `lib/api-client.ts → uploadVoice(blob, filename)` |

### MIME / codec per browser

- Chrome / Edge / Firefox → `audio/webm;codecs=opus` (Opus, tiny)
- Safari → `audio/mp4` (AAC)
- The MediaRecorder MIME is auto-selected via `MediaRecorder.isTypeSupported()` and persisted as the `Blob.type` so the API mime allowlist matches.

### Known limitations

- **5-minute hard cap** to avoid runaway recordings; the timer auto-sends when it hits the cap.
- No waveform rendering, no playback speed, no scrubbing (seek-to-position) — only play/pause + progress.
- Duration is recorder-reported; once `<audio>` metadata loads, the player overrides it with the file's real duration.
- iOS requires the user to interact before mic capture works (browser policy).

## v0.9.0 changelog — Signal Protocol Beta (direct text only)

### Fixed (post-initial-cut)
- **Init-race protection in `signal.service.decryptIncoming`.** If a `MESSAGE_NEW` arrived between login and the end of the initial key-publish, the local IndexedDB lookups would return `undefined` and the bubble would render as `[Unable to decrypt message]`. `decryptIncoming` now `await`s the service's in-flight `initPromise` before reading from IDB.
- **Dev diagnostics around decrypt.** `signal.service.decryptIncoming` logs `[signalix-crypto] decrypt attempt` (with `version`, `signedPreKeyId`, `preKeyId`) and `[signalix-crypto] decrypt success`; `chat.store.decryptStoredMessage` logs `[signalix-crypto] decrypt failed` with the reason on the catch path. All log calls are gated on `NODE_ENV !== 'production'`.
- Companion fix in `Signalix-realtime` — the WS layer was dropping the envelope fields between `client.message.send` and `server.message.new`, so the recipient was seeing the raw `{"v":1,"c":"…","iv":"…","eph":"…"}` JSON. See the realtime README's v0.9.0 changelog.

> ⚠️ **Beta E2EE.** v0.9.0 enables real end-to-end encryption for **direct text messages only**. Groups, images, files, voice notes, reactions, and edited bodies remain plaintext on the server. Not production-grade — no Double Ratchet, no signature verification yet, single-device assumption, no per-message forward secrecy beyond signed-pre-key rotation. **v0.10.0 hardens this**: multi-device fan-out, Double Ratchet, signature verification, pre-key deletion after use.

### Added
- **`src/lib/crypto/signal.service.ts`** — `SignalCryptoService implements CryptoService`. Real Web Crypto:
  - **Identity**: X25519 keypair (ECDH) + Ed25519 keypair (signs every signed pre-key on publish).
  - **Bootstrap**: on first `init({ deviceId })` generates identity / signed-pre-key / 100 one-time pre-keys and publishes via `POST /crypto/devices/keys`. Subsequent calls top up the one-time pool when below 20.
  - **Encrypt**: per-message ephemeral X25519 keypair → `ECDH(eph, signedPreKey) [|| ECDH(eph, oneTimePreKey)]` → HKDF-SHA256 with `info="signalix-v1-direct-text"` → AES-256-GCM with 12-byte random IV.
  - **Envelope wire format**: `JSON.stringify({ v: 1, c: <ciphertext-b64url>, iv: <iv-b64url>, eph: <sender-ephemeral-pub-b64url> })` carried in the existing `messages.ciphertext` column. The 5 envelope columns (`encryption_version`, `sender_device_id`, `recipient_device_id`, `pre_key_id`, `signed_pre_key_id`) from v0.8.0 carry the metadata.
  - **Decrypt**: looks up local signed-pre-key + one-time pre-key by id, reverses the ECDH, derives the same AES key, decrypts.
- **`src/lib/crypto/db.ts`** — IndexedDB schema (`signalix-crypto-v1` database): `identity`, `signed-pre-keys`, `pre-keys`, `plaintext-cache` stores. CryptoKey instances stored directly via structured clone.
- **`src/lib/crypto/plaintext-cache.ts`** — local cache so the sender can re-render their own outgoing text after a history reload (they encrypted to the recipient's keys; their server row is undecryptable to themselves).
- **`src/lib/crypto/utils.ts`** — base64url, X25519/Ed25519 importers, HKDF-AES helper.
- **`crypto.service.ts` swap point** — picks `SignalCryptoService` by default, falls back to the v0.8.0 `MockCryptoService` when `NEXT_PUBLIC_E2EE_DEV_FALLBACK=true`.
- **`auth.store`** kicks off `cryptoService.init({ deviceId })` on every successful hydrate / login / register / refresh / OAuth path. Fire-and-forget — failures are logged, never block auth.
- **`chat.store` integration**:
  - `sendMessage` for direct + TEXT + non-draft messages encrypts via `cryptoService.encryptForRecipient` before WS send. Plaintext fallback on any error (recipient hasn't published keys, network blip, etc.) so transitioning users always send something.
  - `MESSAGE_NEW` handler decrypts encrypted incoming messages in a follow-up tick and replaces the ciphertext in the store.
  - `MESSAGE_SENT` handler caches the sender's plaintext keyed by the freshly-assigned `messageId`.
  - `loadMessages` runs every history page through `decryptStoredMessage`: cache lookup first, then live decrypt, then `DECRYPT_FAILED_PLACEHOLDER`.
- **UX**:
  - Direct-chat header shows a small **🔒 End-to-end encrypted beta** pill next to the presence row.
  - Messages whose ciphertext resolves to `"[Unable to decrypt message]"` render with an italic + unlocked-padlock treatment.

### Compatibility / not encrypted (yet)
- Group chats, image messages, file attachments, voice notes, reactions, replies, forwards, edit, delete, search, push — continue to work as v0.8.0. Reactions / replies / forwards reference the encrypted message by id but the reaction / preview metadata itself is not encrypted.
- The mock service is still shipped — `NEXT_PUBLIC_E2EE_DEV_FALLBACK=true` falls back to plaintext for local dev when running against unpublished peers.

### Known limitations
- **No Double Ratchet** — single ephemeral keypair per message; no chain keys; forward secrecy is bounded by signed-pre-key rotation cadence.
- **No multi-device fan-out** — the sender picks the first device bundle returned by `GET /crypto/users/:userId/key-bundle`. Other devices of the same recipient won't receive the message.
- **No signature verification** of submitted signed-pre-keys — the API stores them as opaque blobs. v0.10.0 lands Ed25519 verification.
- **Pre-keys are not deleted locally** after first use. Real Signal deletes them to bound the blast radius of device compromise.
- **Sender history needs the local plaintext cache.** Logging into a brand-new browser leaves earlier sent messages as `[Unable to decrypt message]` until v0.10.0's sender-key archive lands.
- **No safety-number / key-verification UX yet** — users can't verify they're talking to the right device.

## v0.8.0 changelog

### Added — Encryption foundation (NOT real E2EE yet)

> **Important.** v0.8.0 ships the type system, the API client surface, and the abstraction layer for a future Signal-Protocol-style E2EE rollout. **No messages are actually encrypted yet** — the frontend's crypto layer is a passthrough mock and the backend keeps receiving plaintext in `messages.ciphertext`. **v0.9.0 will be the real E2EE beta.**

- **`src/lib/crypto/`** scaffolding:
  - `crypto.types.ts` — re-exports of contracts crypto DTOs + the `CryptoService` interface and `EncryptedEnvelope` shape.
  - `crypto.service.ts` — exports a singleton `cryptoService: CryptoService` plus a `getCryptoStatus()` helper for settings UI. Swapping to the real implementation in v0.9.0 is a one-line change here.
  - `crypto.mock.ts` — `MockCryptoService` returns `{ ciphertext: plaintext, encryptionVersion: 0 }` from `encryptForRecipient`, passes plaintext through `decryptIncoming`, surfaces a `[encrypted message — upgrade to view]` placeholder if an incoming envelope is `encryptionVersion >= 1`. Dev console logs `[signalix-crypto] mock service ready — no E2EE active`.
- **Contracts** — `MessageDTO`, `SendMessageRequest`, `ClientMessageSendPayload`, `ServerMessageNewPayload` all gain optional `encryptionVersion`, `senderDeviceId`, `recipientDeviceId`, `preKeyId`, `signedPreKeyId`. Compatible with v0.7.x clients.

### Not integrated yet
- The crypto service is **not** yet wired into `chat.store.sendMessage` or the WS receive path. That's a v0.9.0 task once the real implementation lands. Today the scaffolding exists so the call sites can be migrated atomically.
- The crypto endpoints in the API (`/crypto/devices/keys` etc.) are reachable but **not called by the frontend in v0.8.0**.

### Not broken
- Direct chats, group chats, media, files, voice notes, reactions, replies, forwards, edit, delete, sidebar / in-chat search, push notifications — all continue to work exactly as in v0.7.1.

## v0.7.1 changelog

### Added
- **Message search in the sidebar** — the existing search input fans out to both `searchUsers` and the new `searchMessages` endpoint in parallel. Results panel shows a **People** section and a new **Messages** section with chat label / avatar, sender name (group chats only), timestamp and snippet. Match is highlighted inline with a translucent blue background; the snippet windows around the match when it's deep into a long body.
- **Sidebar pagination scroll** — message-results list is now infinite-scroll. The scrollable container watches its scroll position; when within 120 px of the bottom, fetches the next page via `searchMessages(q, { limit: 12, cursor })`. New state tracks `messageNextCursor`, `messageHasMore`, `loadingMore`. Stale responses are discarded if the user typed something newer mid-flight (tracked by an `activeQueryRef`). A "Load more" fallback button shows below the list for browsers without smooth scroll watching. Each new query resets paging and scrolls the container back to top.
- **Click-through to message** — selecting a message result navigates to `/chats/<chatId>?m=<messageId>`. `MessageView` reads the `m` query param, scrolls the row into view (`block: 'center'`), and applies a transient blue ring (`signalix-search-hit` utility in `globals.css`) that fades after ~2 s. Each bubble row carries a `data-message-id` attribute.
- **In-chat search (iMessage-style)** — the magnifier icon in the chat header (previously disabled) is now wired. Tapping it morphs the entire header into a search bar: pill input + "X of Y" counter + ↑ / ↓ navigation + ✕ close. Same layout works on desktop and mobile (replaces the header title on mobile).
  - Debounced (220 ms) call to `GET /chats/:chatId/search`.
  - Keyboard: `Enter` = next, `Shift+Enter` = prev, `Esc` = close.
  - Each matching bubble gets an **amber ring** (`signalix-search-match`); the focused match gets a **stronger blue ring with glow** (`signalix-search-active`) and auto-scrolls into view via a `useEffect` on `isActiveMatch`.
  - TEXT bubbles render every occurrence of the query inline as `<mark>` (`highlightMatches` helper).
  - File bubbles still match (filename is substring-searched server-side via the FILE JSON) but get the row-level ring only — inline highlight inside the FileCard isn't done yet.
  - Drafts skip search entirely (no real chatId).
- **`lib/api-client.ts → searchInChat(chatId, q, { limit?, cursor? })`** — typed wrapper around `GET /api/v1/chats/:chatId/search`.

### Known limitations (v0.7.1)
- Scroll-to-message (global) only works if the target is in the loaded page (default 50 newest messages). Older messages: open the chat, scroll up manually.
- In-chat search fetches up to 100 matches at a time. For chats with more than 100 hits the rest live behind `nextCursor`; not yet wired into the UI (the existing match navigation operates on the current batch).
- Inline `<mark>` highlight only on TEXT bubbles. FILE/voice bubbles get the row-level ring only.

## v0.7.0 changelog

### Added
- **Group profile (modal)** — `GroupInfoModal` expanded into a full group-details surface with:
  - **Group avatar** — Avatar component now consumes `chat.avatarUrl`; pencil/camera badge over the avatar opens an upload/remove menu (owner / admin only). Initials fallback when no avatar set, keyed by `chat.id` for stable colour. Same surface is used by `ChatItem` (sidebar row) and the chat header in `MessageView` so the avatar shows up everywhere instantly after upload.
  - **Editable description** — owner/admin can Add / Edit / clear a description (max 500 chars, plain text, multiline). Empty value clears server-side.
  - **Transfer ownership** — owner-only "Transfer ownership" entry on each non-owner member's per-row menu. Old owner becomes admin.
  - Refreshed per-member action menu (three-dot) hosting Transfer and Remove actions side by side instead of an inline trash icon.
- **Store actions** — `uploadGroupAvatar`, `removeGroupAvatar`, `transferGroupOwnership`; `updateGroupChat` signature widened from `(chatId, title)` to `(chatId, patch)` where `patch = { title?, description? }`.
- **API client helpers** — `uploadGroupAvatar(chatId, file)`, `removeGroupAvatar(chatId)`, `transferGroupOwnership(chatId, { newOwnerId })`.

### Changed
- `MessageView` header and `ChatItem` sidebar row read `chat.avatarUrl` for groups (no fallback to initials when one is set). `ForwardModal` chat picker also surfaces the group avatar.

## v0.6.1 changelog

### Added
- **Voice messages (recorder + player)** — see "Voice messages" section above.
- **Mic button** in the composer that swaps with the send button when the textarea is empty.

### Fixed
- **`chat.store.sendMessage` stops downcasting AUDIO** — the cast `(messageType ?? TEXT) as TEXT | IMAGE | FILE` silently masked the broader contract. Replaced with `SendableMessageType` so the WS payload carries `messageType: 'audio'` literally to the realtime / API / DB.

## v0.6.0 changelog

### Added
- **PWA foundation** — `manifest.webmanifest`, SVG icons (standard + maskable + apple-touch), minimal service worker, registration component, dismissible install banner
- **Next.js metadata** — `Metadata.manifest`, `Metadata.appleWebApp`, `Viewport.themeColor` (light + dark)
- **UI refresh** — Liquid Glass / visionOS-inspired pass: translucent surfaces with `backdrop-blur`, soft ambient shadows (`shadow-glass`, `shadow-glass-sm`), pill-shaped inputs, scale-on-hover motion, layered background gradients (no pure black), graphite glass message bubbles, no purple
- **Web Push notifications** — `lib/push.ts` client, `PushSettingsCard` in profile, `sw.js` `push` + `notificationclick` handlers, client-side navigation from focused windows

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
