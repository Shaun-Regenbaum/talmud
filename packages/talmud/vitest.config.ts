import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

// `cloudflare:workers` (WorkflowEntrypoint, imported at index.ts module scope for
// DafWarmWorkflow) isn't resolvable under node/vitest — alias it to a no-op stub
// so any test that transitively imports index.ts still loads. The real module is
// used at deploy; tsc types come from @cloudflare/workers-types.
const cloudflareWorkersStub = fileURLToPath(
  new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url),
);

// Two isolated projects so the SolidJS render tests (jsdom + the solid JSX
// transform + browser resolution conditions) never perturb the worker/unit
// tests, which run plain in node. Split purely by file extension:
//   - node   → tests/**/*.test.ts   (existing suite; some opt into jsdom via a
//              per-file `// @vitest-environment jsdom` pragma)
//   - client → tests/**/*.test.tsx  (component render tests)
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { 'cloudflare:workers': cloudflareWorkersStub } },
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', 'tests/integration/**'],
          environment: 'node',
        },
      },
      {
        plugins: [solid()],
        resolve: {
          conditions: ['development', 'browser'],
          alias: { 'cloudflare:workers': cloudflareWorkersStub },
        },
        test: {
          name: 'client',
          include: ['tests/**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
