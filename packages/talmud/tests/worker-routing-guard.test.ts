import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Routing guard — locks the run_worker_first list in wrangler.toml to the
// Worker's live surface.
//
// run_worker_first as a pattern list is EXCLUSIVE: only matching paths invoke
// the Worker; every other non-asset path is served the SPA index.html by the
// asset layer, the Worker never running. When the list was narrowed to just
// ["/"] (PR #563), every /api/* and /mcp request on every hostname returned
// the HTML shell and both apps' data layers went down (2026-07-17). The config
// is invisible at code-review time; this suite makes it fail CI instead.

const stripComments = (toml: string): string =>
  toml
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');

const readRunWorkerFirst = (tomlPath: URL): string[] => {
  const toml = stripComments(readFileSync(tomlPath, 'utf8'));
  const m = toml.match(/run_worker_first\s*=\s*\[([^\]]*)\]/);
  expect(m, 'run_worker_first list').toBeTruthy();
  return [...(m as RegExpMatchArray)[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
};

describe('routing guard: run_worker_first covers the Worker surface', () => {
  const patterns = readRunWorkerFirst(new URL('../wrangler.toml', import.meta.url));

  it('routes /api/* through the Worker (otherwise every API call serves the SPA shell)', () => {
    expect(patterns).toContain('/api/*');
  });

  it('routes /mcp through the Worker (the code-mode MCP server)', () => {
    expect(patterns).toContain('/mcp');
  });

  it('routes "/" through the Worker (the legacy-host redirect must see the bare domain)', () => {
    expect(patterns).toContain('/');
  });
});
