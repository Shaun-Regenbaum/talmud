import { createSignal, For, type JSX } from 'solid-js';

/**
 * Guide for connecting an MCP client (Claude Code / Desktop, etc.) to this app's
 * hosted "code mode" MCP server at /mcp. Reached at /connect, linked from the
 * reader footer next to "usage". Dev-facing (commands / JSON / code), so it
 * stays in English. Mirrors talmud.dev's #mcp page.
 */

const MCP_URL = 'https://tanach.dev/mcp';

const CLAUDE_CODE_CMD = `claude mcp add --transport http tanach ${MCP_URL}`;

const JSON_CONFIG = `{
  "mcpServers": {
    "tanach": {
      "url": "${MCP_URL}"
    }
  }
}`;

const WORKED_EXAMPLE = `// Run inside the \`execute\` tool. One round trip: the chapter's
// verses, its overview, and how the Rishonim read one verse.
async () => {
  const [chapter, overview, synthesis] = await Promise.all([
    codemode.request({ method: "GET", path: "/api/chapter/Proverbs/3" }),
    codemode.request({ method: "GET", path: "/api/overview/Proverbs/3" }),
    codemode.request({ method: "GET", path: "/api/synthesis/Proverbs/3/12" }),
  ]);
  return {
    verse: chapter.verses.find((v) => v.n === 12),
    overview: overview.en,
    rishonim: synthesis.en,
  };
}`;

function CopyButton(props: { text: string }): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  return (
    <button
      type="button"
      class="connect-copy"
      onClick={() => {
        navigator.clipboard?.writeText(props.text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      }}
    >
      {copied() ? 'copied' : 'copy'}
    </button>
  );
}

function Code(props: { children: string }): JSX.Element {
  return (
    <div class="connect-code">
      <CopyButton text={props.children} />
      <pre>
        <code>{props.children}</code>
      </pre>
    </div>
  );
}

const TOOLS = [
  {
    name: 'search',
    blurb:
      'Query the OpenAPI spec to discover endpoints: call codemode.spec() and filter it in code. No request leaves the sandbox.',
  },
  {
    name: 'execute',
    blurb:
      'Run an async arrow function that calls codemode.request({ method, path, query, body }). Chain calls inside one function; only the returned value comes back.',
  },
];

export function ConnectPage(): JSX.Element {
  return (
    <main class="connect-page">
      <header>
        <h1>Connect via MCP</h1>
        <a href="/">back to the reader</a>
      </header>

      <p>
        This app hosts a <strong>Model Context Protocol</strong> server so an AI client can pull the
        same data the reader is built from: chapter text, the perek overview, events, geography, the
        Rishonim on a verse and a synthesis of them, midrash, how the Gemara uses a verse, and this
        week's parsha. It uses Cloudflare's <strong>code mode</strong>: two tools,{' '}
        <code>search</code> and <code>execute</code>, and the model writes small snippets that call
        the API and chain results in a single round trip.
      </p>

      <h2>Endpoint</h2>
      <Code>{MCP_URL}</Code>

      <h2>Add it to Claude Code</h2>
      <Code>{CLAUDE_CODE_CMD}</Code>

      <h2>Or add it to any MCP client (JSON config)</h2>
      <p>For Claude Desktop and other clients that take a streamable-HTTP server by URL:</p>
      <Code>{JSON_CONFIG}</Code>

      <h2>The two tools</h2>
      <For each={TOOLS}>
        {(tool) => (
          <p>
            <code>{tool.name}</code> <span>{tool.blurb}</span>
          </p>
        )}
      </For>

      <h2>Worked example</h2>
      <Code>{WORKED_EXAMPLE}</Code>

      <h2>Cold chapters</h2>
      <p>
        AI pieces (overview, events, synthesis, midrash synthesis, notes) are generated the first
        time anyone asks for them and cached after that. A cold call blocks until the piece is
        ready, usually 5 to 40 seconds. The <code>execute</code> sandbox stops a script after 90
        seconds; if a call runs out of time, say so and call again. The work keeps running on the
        server, so the next call returns the cached result at once. Raw text (chapters, Rishonim,
        midrash sources, Gemara links) comes from Sefaria and is fast.
      </p>

      <h2>Access</h2>
      <p>
        The endpoint is open and read-only. Connect and start pulling chapter data right away. The
        Talmud reader's MCP lives at <a href="https://talmud.dev/#mcp">talmud.dev/#mcp</a>; the two
        install side by side.
      </p>
    </main>
  );
}
