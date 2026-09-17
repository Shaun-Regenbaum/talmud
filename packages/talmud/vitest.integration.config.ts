import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Config used by `pnpm test:int` — runs only the integration tests that
// hit a live worker (TALMUD_URL or default localhost:5173).
// `cloudflare:workers` is imported at index.ts module scope (DafWarmWorkflow)
// and isn't resolvable under node — alias it to the same no-op stub the unit
// config uses, so integration tests that import the worker module load.
const cloudflareWorkersStub = fileURLToPath(
  new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url),
);

export default defineConfig({
  resolve: { alias: { 'cloudflare:workers': cloudflareWorkersStub } },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 300000,
  },
});
