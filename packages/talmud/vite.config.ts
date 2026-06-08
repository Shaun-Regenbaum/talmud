import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    solid(),
    cloudflare(),
  ],
  publicDir: 'static',
});
