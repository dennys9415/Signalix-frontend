import { defineConfig } from 'vitest/config';

// Node 20+ exposes Web Crypto with X25519 + Ed25519 at globalThis.crypto,
// so we run tests in the default 'node' environment without polyfills.
// Frontend integration tests (which need jsdom + IndexedDB) are out of
// scope for v0.9.1 — we only cover pure crypto utilities here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
