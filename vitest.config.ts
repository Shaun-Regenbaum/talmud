import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default: all tests under tests/ EXCEPT the integration subdir (those
    // hit a running worker and are gated by `pnpm test:int`).
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/integration/**'],
    environment: 'node',
  },
});
