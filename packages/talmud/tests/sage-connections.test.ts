import { describe, expect, it } from 'vitest';
import { TALMUD_OPENAPI } from '../src/worker/mcp-openapi';
import { loadConnections } from '../src/worker/sage-interactions';

const assets = (body: string, status = 200, seen: string[] = []): Fetcher =>
  ({
    fetch: async (req: Request) => {
      seen.push(new URL(req.url).pathname);
      return new Response(body, { status });
    },
  }) as unknown as Fetcher;

const file = JSON.stringify({
  slug: 'rava',
  nameHe: 'רבא',
  partners: [{ nameHe: 'אביי', total: 345 }],
});

describe('loadConnections', () => {
  it('serves the text-built connections when the sage has a file', async () => {
    const seen: string[] = [];
    const c = await loadConnections(assets(file, 200, seen), 'rava', null);
    expect(seen).toEqual(['/sage-interactions/rava.json']);
    expect(c.status).toBe('ready');
    expect((c.interactions as { partners: unknown[] }).partners).toHaveLength(1);
  });

  it('says "in-progress" when the sage has no file (the assets host serves the app page instead)', async () => {
    const c = await loadConnections(assets('<!doctype html><html></html>'), 'rabbi-yochanan', null);
    expect(c).toMatchObject({ status: 'in-progress', slug: 'rabbi-yochanan' });
    expect(c.note).toMatch(/still being worked out/);
    expect(c.interactions).toBeUndefined();
  });

  it('says "in-progress" on a 404, and never fetches a path built from a strange slug', async () => {
    expect((await loadConnections(assets('', 404), 'rava', null)).status).toBe('in-progress');
    const seen: string[] = [];
    const c = await loadConnections(assets(file, 200, seen), '../secrets', null);
    expect(c.status).toBe('in-progress');
    expect(seen).toEqual([]);
  });
});

describe('MCP spec: connections', () => {
  const paths = (
    TALMUD_OPENAPI as unknown as {
      paths: Record<string, { get?: { description?: string; summary?: string } }>;
    }
  ).paths;
  it('documents the connections endpoint and tells clients how to talk about an unfinished sage', () => {
    const op = paths['/api/rabbi-interactions/{slug}'].get;
    expect(op?.description).toMatch(/in-progress/);
    expect(op?.description).toMatch(/still being worked out/);
  });
  it('says the entity piece no longer serves the guessed tree', () => {
    expect(paths['/api/entity/rabbi/{slug}'].get?.summary).toMatch(/no longer served/);
  });
});
