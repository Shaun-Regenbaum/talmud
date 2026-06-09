import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid(), cloudflare()],
  publicDir: 'static',
});
