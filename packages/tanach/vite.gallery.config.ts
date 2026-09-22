import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// Reuse the workspace's existing build tools without starting either worker.
export default defineConfig({
  root: fileURLToPath(new URL('../ui', import.meta.url)),
  publicDir: false,
  plugins: [solid()],
  optimizeDeps: { exclude: ['@corpus/ui'] },
  server: { host: '127.0.0.1', port: 5210, strictPort: true },
  build: { outDir: 'dist/gallery', copyPublicDir: false },
});
