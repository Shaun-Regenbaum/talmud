import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [
    solid(),
    // The reader's wrangler.toml binds DafWarmWorkflow by script name
    // (script_name = "talmud-gen"), so the local runtime must know the
    // generator too or it refuses to start ("refers to a service
    // core:user:talmud-gen, but no such service is defined"). Running the
    // generator as an auxiliary worker mirrors production: two scripts, one
    // KV namespace. `wrangler deploy` reads wrangler.toml directly and is
    // unaffected by this dev-only wiring.
    cloudflare({
      auxiliaryWorkers: [{ configPath: './wrangler.generator.toml' }],
    }),
  ],
  publicDir: 'static',
  // @corpus/ui ships Solid .tsx as source (a workspace package). Excluding it
  // from esbuild dep pre-bundling lets vite-plugin-solid run the JSX transform
  // on the shared components (e.g. GeoMap).
  optimizeDeps: { exclude: ['@corpus/ui'] },
});
