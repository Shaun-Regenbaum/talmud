import { StreamableHTTPTransport } from '@hono/mcp';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { handleMcpRequest } from '../src/mcp/code-mode';

// Exercise the installed transport itself, including its thrown HTTP responses.
function app() {
  const events: Array<{ status: number; error?: string }> = [];
  const router = new Hono();
  router.all('/mcp', async (c) => {
    const server = new Server({ name: 'talmud', version: '1.0.0' });
    const transport = new StreamableHTTPTransport({ enableJsonResponse: true });
    await server.connect(transport);
    return handleMcpRequest(
      c,
      () => transport.handleRequest(c),
      (status, error) => {
        events.push({ status, error });
      },
    );
  });
  return { router, events };
}

describe('MCP transport rejections', () => {
  it('reports an unsupported-version discovery request as 400, not 500', async () => {
    const { router, events } = app();
    const res = await router.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2026-07-28',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain('Unsupported protocol version');
    expect(events).toEqual([{ status: 400, error: body.error.message }]);
  });

  it('keeps malformed JSON and missing content type as client errors', async () => {
    for (const headers of [new Headers({ 'content-type': 'application/json' }), new Headers()]) {
      const { router, events } = app();
      const res = await router.request('/mcp', { method: 'POST', headers, body: '{' });
      expect(res.status).toBe(headers.has('content-type') ? 400 : 415);
      expect(events).toHaveLength(1);
      expect(events[0].status).toBe(res.status);
      expect(events[0].error).toBeTruthy();
    }
  });

  it('still accepts a legacy initialization', async () => {
    const { router, events } = app();
    const res = await router.request('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'talmud', version: '1.0.0' },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { protocolVersion: string } };
    expect(body.result.protocolVersion).toBe('2025-11-25');
    expect(events).toEqual([{ status: 200, error: undefined }]);
  });
});
