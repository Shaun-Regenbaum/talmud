import { describe, expect, it } from 'vitest';
import { MCP_EXECUTE_TIMEOUT_MS } from '../src/worker/mcp-limits';
import { TALMUD_OPENAPI } from '../src/worker/mcp-openapi';

// The spec's info.description is the ONLY guidance the model gets. These pin the
// parts a user-facing MCP client depends on: the cold-daf rule, the stated
// sandbox limit matching the real one, and the daf-view generate flag.

type Spec = {
  info: { description: string };
  servers: Array<{ url: string }>;
  paths: Record<
    string,
    Record<
      string,
      { parameters?: Array<{ name: string }>; responses?: Record<string, { description: string }> }
    >
  >;
};
const spec = TALMUD_OPENAPI as unknown as Spec;

describe('MCP spec: cold-daf honesty', () => {
  it('leads with the one-shot read + generate=1 and states the cold-daf rule', () => {
    expect(spec.info.description).toMatch(/READING A DAF/);
    expect(spec.info.description).toMatch(/daf-view\/\{t\}\/\{p\}\?generate=1/);
    expect(spec.info.description).toMatch(/COLD DAF RULE/);
    expect(spec.info.description).toMatch(/BE HONEST, DO NOT WAIT/);
  });

  it('tells the model the REAL sandbox limit (the constant the executor uses)', () => {
    const seconds = Math.round(MCP_EXECUTE_TIMEOUT_MS / 1000);
    expect(spec.info.description).toContain(`after ${seconds} s`);
    expect(MCP_EXECUTE_TIMEOUT_MS).toBeGreaterThan(30_000); // the codemode default was too short
  });

  it('documents the generate flag and the follow-up fields on daf-view', () => {
    const op = spec.paths['/api/daf-view/{tractate}/{page}'].get;
    expect(op.parameters?.map((p) => p.name)).toContain('generate');
    expect(op.responses?.['200'].description).toMatch(/checkUrl/);
    expect(op.responses?.['200'].description).toMatch(/readerUrl/);
    expect(op.responses?.['200'].description).toMatch(/generating/);
  });

  it('documents checkUrl + retryAfterSeconds on the pending run envelope', () => {
    const run = spec.paths['/api/run'].post;
    expect(run.responses?.['202'].description).toMatch(/checkUrl/);
    expect(run.responses?.['202'].description).toMatch(/retryAfterSeconds/);
    const status = spec.paths['/api/run-status/{runId}'].get;
    expect(status.responses?.['202'].description).toMatch(/retryAfterSeconds/);
  });

  it('names talmud.dev first and keeps the legacy host for existing clients', () => {
    expect(spec.servers[0].url).toBe('https://talmud.dev');
    expect(spec.servers.map((s) => s.url)).toContain('https://talmud.shaunregenbaum.com');
  });
});
