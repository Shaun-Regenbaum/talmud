import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TANACH_OPENAPI } from '../src/worker/mcp-openapi';

// Drift guard: every public /api route the worker registers is described in
// the MCP spec (the `search` tool is the only way a model discovers routes), and
// the spec describes nothing the worker doesn't serve.

type Spec = {
  info: { description: string };
  servers: Array<{ url: string }>;
  paths: Record<string, unknown>;
};
const spec = TANACH_OPENAPI as unknown as Spec;

/** Routes deliberately kept out of the spec (operator-only). */
const UNDOCUMENTED = new Set(['/api/billing']);

function workerRoutes(): string[] {
  const src = readFileSync(new URL('../src/worker/index.ts', import.meta.url), 'utf8');
  return [...src.matchAll(/app\.get\('(\/api\/[^']*)'/g)]
    .map((m) => m[1].replace(/:([A-Za-z]+)/g, '{$1}'))
    .filter((r) => !UNDOCUMENTED.has(r));
}

describe('tanach MCP spec', () => {
  it('documents every public /api route the worker serves', () => {
    const missing = workerRoutes().filter((r) => !(r in spec.paths));
    expect(missing).toEqual([]);
  });

  it('describes only routes the worker actually serves', () => {
    const served = new Set(workerRoutes());
    const phantom = Object.keys(spec.paths).filter((p) => !served.has(p));
    expect(phantom).toEqual([]);
  });

  it('names tanach.dev first and keeps the legacy host for existing clients', () => {
    expect(spec.servers[0].url).toBe('https://tanach.dev');
    expect(spec.servers.map((s) => s.url)).toContain('https://tanach.shaunregenbaum.com');
  });

  it('tells the model routes generate inline and what to do on a timeout', () => {
    expect(spec.info.description).toMatch(/COLD/);
    expect(spec.info.description).toMatch(/90 s/);
    expect(spec.info.description).toMatch(/call again/i);
  });
});
