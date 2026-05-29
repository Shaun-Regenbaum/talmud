import { createSignal, For, Show, type JSX } from 'solid-js';

/**
 * Guide for connecting an MCP client (Claude Code / Desktop, etc.) to this app's
 * hosted "code mode" MCP server at /mcp. Reached at #mcp, linked from the daf
 * footer next to "Usage & reports" / "Alignment debug". Content is dev-facing
 * (commands / JSON / code), so it stays in English like the credits page.
 */

const MCP_URL = 'https://talmud.shaunregenbaum.com/mcp';

const CLAUDE_CODE_CMD = `claude mcp add --transport http talmud ${MCP_URL}`;

const JSON_CONFIG = `{
  "mcpServers": {
    "talmud": {
      "url": "${MCP_URL}"
    }
  }
}`;

const WORKED_EXAMPLE = `// Run inside the \`execute\` tool. One round trip:
// fetch the daf, run a mark, poll until the anchors land.
async () => {
  const daf = await codemode.request({
    method: "GET", path: "/api/daf/Berakhot/2a",
  });

  let run = await codemode.request({
    method: "POST", path: "/api/studio/run",
    body: { tractate: "Berakhot", page: "2a", mark_id: "argument-move" },
  });
  while (run.status === "pending") {
    await new Promise((r) => setTimeout(r, 1500));
    run = await codemode.request({
      method: "GET",
      path: \`/api/studio/run-status/\${run.runId}\`,
      query: { k: run.cacheKey },
    });
  }

  return {
    segments: daf.mainSegmentsHe.length,
    anchors: run.result?.parsed?.instances ?? run,
  };
}`;

function CopyButton(props: { text: string }): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(props.text).then(
          () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
          () => {},
        );
      }}
      style={{
        position: 'absolute', top: '0.5rem', right: '0.5rem',
        'font-size': '0.7rem', padding: '0.15rem 0.5rem',
        border: '1px solid #ccc', 'border-radius': '5px',
        background: copied() ? '#2f7d32' : '#fff', color: copied() ? '#fff' : '#555',
        cursor: 'pointer',
      }}
    >
      {copied() ? 'copied' : 'copy'}
    </button>
  );
}

function Code(props: { children: string }): JSX.Element {
  return (
    <div style={{ position: 'relative', margin: '0.6rem 0 1.2rem' }}>
      <CopyButton text={props.children} />
      <pre style={{
        margin: 0, padding: '0.9rem 1rem', 'padding-right': '3.5rem',
        background: '#1e1e22', color: '#e6e6e6', 'border-radius': '8px',
        overflow: 'auto', 'font-size': '0.8rem', 'line-height': 1.5,
        'font-family': 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      }}>
        <code>{props.children}</code>
      </pre>
    </div>
  );
}

const TOOLS = [
  {
    name: 'search',
    blurb: 'Query the OpenAPI spec to discover endpoints — call codemode.spec() and filter it in code. No request leaves the sandbox.',
  },
  {
    name: 'execute',
    blurb: 'Run an async arrow function that calls codemode.request({ method, path, query, body }). Chain calls and poll inside one function; only the returned value comes back.',
  },
];

export function McpPage(): JSX.Element {
  return (
    <main class="page-shell" style={{ '--page-max': '780px', 'font-family': 'system-ui, -apple-system, sans-serif', color: '#222' } as JSX.CSSProperties}>
      <header style={{ 'margin-bottom': '1.25rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.5rem' }}>Connect via MCP</h1>
        <a href="#daf" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>← back to daf</a>
      </header>

      <p style={{ color: '#444', 'line-height': 1.6, 'margin-bottom': '1.25rem' }}>
        This app hosts a <strong>Model Context Protocol</strong> server so an AI client can pull the
        same data the daf page is built from — text, context, the marks/enrichments that produce the
        anchors, rabbi data, and debug telemetry. It uses Cloudflare's <strong>code mode</strong>:
        instead of dozens of separate tools you get just two — <code>search</code> and{' '}
        <code>execute</code> — and the model writes small snippets that call the API and chain
        results in a single round trip.
      </p>

      <h2 style={{ 'font-size': '1.05rem', 'margin-bottom': '0.4rem' }}>Endpoint</h2>
      <Code>{MCP_URL}</Code>

      <h2 style={{ 'font-size': '1.05rem', 'margin-bottom': '0.4rem' }}>Add it to Claude Code</h2>
      <Code>{CLAUDE_CODE_CMD}</Code>

      <h2 style={{ 'font-size': '1.05rem', 'margin-bottom': '0.4rem' }}>Or add it to any MCP client (JSON config)</h2>
      <p style={{ color: '#555', 'font-size': '0.88rem', margin: '0 0 0.2rem' }}>
        For Claude Desktop and other clients that take a streamable-HTTP server by URL:
      </p>
      <Code>{JSON_CONFIG}</Code>

      <h2 style={{ 'font-size': '1.05rem', 'margin-bottom': '0.4rem' }}>The two tools</h2>
      <For each={TOOLS}>
        {(tool) => (
          <p style={{ margin: '0 0 0.6rem', 'line-height': 1.55 }}>
            <code style={{ background: '#f0f0f2', padding: '0.05rem 0.35rem', 'border-radius': '4px' }}>{tool.name}</code>
            <span style={{ color: '#444', 'font-size': '0.9rem' }}> — {tool.blurb}</span>
          </p>
        )}
      </For>

      <h2 style={{ 'font-size': '1.05rem', 'margin': '1rem 0 0.4rem' }}>Worked example</h2>
      <p style={{ color: '#555', 'font-size': '0.88rem', margin: '0 0 0.2rem' }}>
        A daf page is text plus <em>marks</em> (structural extractors whose <code>excerpt</code>s are
        the anchors) and <em>enrichments</em> (LLM passes on a mark instance). Marks/enrichments run
        through <code>POST /api/studio/run</code>, which is async — poll{' '}
        <code>/api/studio/run-status/&#123;runId&#125;</code> until it is done:
      </p>
      <Code>{WORKED_EXAMPLE}</Code>

      <h2 style={{ 'font-size': '1.05rem', 'margin-bottom': '0.4rem' }}>Access</h2>
      <p style={{ color: '#444', 'font-size': '0.9rem', 'line-height': 1.55, 'margin-bottom': '2rem' }}>
        The endpoint is open and read-focused — connect and start pulling daf data right away.
        Everything in the examples above works on the public endpoint. A few advanced operations are
        reserved for the maintainer and will return an authorization error if called.
      </p>
    </main>
  );
}
