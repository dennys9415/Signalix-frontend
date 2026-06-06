# Signalix Frontend

Next.js 15 / React 19 / Tailwind CSS / Zustand v5 chat client for Signalix v0.1.

## Rules

- **No OAuth, no password reset, no media, no E2EE.**
- **Do not duplicate types from `@signalix/contracts`.** Import everything from there.
- Use `ciphertext` field for message text (UI labels it as "Message" for v0.1).
- All API calls go through `src/lib/api-client.ts`.
- All WebSocket events go through `src/lib/ws-client.ts` (singleton).
- State lives in `src/store/auth.store.ts` and `src/store/chat.store.ts`.

## Key architecture decisions

- **`output: 'standalone'`** in `next.config.ts` — Docker runtime copies from `.next/standalone`.
- **`NEXT_PUBLIC_*` env vars** are baked at build time. Pass `--build-arg` in Docker.
- Messages stored oldest-first in the store; API returns newest-first and is reversed on ingestion.
- WS singleton (`wsClient`) is initialized by `auth.store` on login/hydrate and torn down on logout.
- Token refresh on 401: `authed()` in `api-client.ts` silently refreshes and retries once.

## Dev

```bash
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
```

## Build

```bash
# From monorepo root (proyect/)
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_WS_URL=wss://realtime.example.com \
  -f Signalix-frontend/Dockerfile \
  -t signalix-frontend .
```
