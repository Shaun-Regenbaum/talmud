import { defineConfig } from 'vitest/config';

// Dedicated vitest config: vite.config.ts pulls in the Cloudflare plugin,
// which cannot run under vitest's node environment (it rejects the
// resolve.external vitest sets). Tests here are plain node unit tests.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
