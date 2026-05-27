import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

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
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', 'tests/integration/**'],
          environment: 'node',
        },
      },
      {
        plugins: [solid()],
        resolve: { conditions: ['development', 'browser'] },
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
