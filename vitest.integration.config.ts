import { defineConfig } from 'vitest/config';

// Config used by `pnpm test:int` — runs only the integration tests that
// hit a live worker (TALMUD_URL or default localhost:5173).
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 300000,
  },
});
