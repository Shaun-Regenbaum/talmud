import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid(), cloudflare()],
  publicDir: 'static',
  // @corpus/ui ships Solid .tsx as source (a workspace package). Excluding it
  // from esbuild dep pre-bundling lets vite-plugin-solid run the JSX transform
  // on the shared components (e.g. GeoMap).
  optimizeDeps: { exclude: ['@corpus/ui'] },
});
