import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// Reuse the workspace's existing build tools without starting either worker.
export default defineConfig({
  root: fileURLToPath(new URL('../ui', import.meta.url)),
  publicDir: false,
  plugins: [solid()],
  optimizeDeps: { exclude: ['@corpus/ui'] },
  server: {
    host: '127.0.0.1',
    port: 5210,
    strictPort: true,
    proxy: Object.fromEntries(
      [
        '/api/usage/activity',
        '/api/usage/surfaces',
        '/api/billing',
        '/api/run-tree/Berakhot/2a/tidbit.essay',
      ].map((path) => [
        `^/gallery-api${path.replaceAll('.', '\\.')}($|[?])`,
        {
          target: 'https://talmud.dev',
          changeOrigin: true,
          rewrite: (url: string) => url.replace('/gallery-api', ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (request, incoming) => {
              if (incoming.method !== 'GET') request.destroy();
            });
          },
        },
      ]),
    ),
  },
  build: { outDir: 'dist/gallery', copyPublicDir: false },
});
