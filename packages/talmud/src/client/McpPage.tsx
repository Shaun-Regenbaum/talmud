/**
 * #mcp — the guide for connecting an MCP client (Claude Code / Desktop, etc.)
 * to this app's hosted "code mode" MCP server at /mcp. Reached from the daf
 * footer and the About page. Set in the same reading layout as #about: one
 * column with marginalia. Content is dev-facing (commands / JSON / code), so it
 * stays in English like the About page.
 */
import { createSignal, For, type JSX } from 'solid-js';

const REPO = 'https://github.com/Shaun-Regenbaum/talmud';
const DOCS = `${REPO}/blob/master`;

const MCP_URL = 'https://talmud.dev/mcp';

const CLAUDE_CODE_CMD = `claude mcp add --transport http talmud ${MCP_URL}`;

const JSON_CONFIG = `{
  "mcpServers": {
    "talmud": {
      "url": "${MCP_URL}"
    }
  }
}`;

const WORKED_EXAMPLE = `// Run inside the \`execute\` tool. One round trip:
// read everything the daf already has; if it is cold, start
// generation and say so instead of waiting.
async () => {
  const view = await codemode.request({
    method: "GET", path: "/api/daf-view/Sotah/4a",
    query: { generate: "1" },
  });

  if (view.error) return view;
  if (!view.complete) {
    // A whole daf can take several minutes. Return now with
    // what exists and where to look, and let the user ask again.
    return {
      ready: false,
      pieces: view.pieces,
      missing: view.cold,
      generating: view.generating,
      message: view.hint,        // one plain sentence, ready to relay
      readerUrl: view.readerUrl, // the human page, fills in live
      checkUrl: view.checkUrl,   // re-read this next time
    };
  }

  return { ready: true, pieces: view.pieces };
}`;

const PIECE_EXAMPLE = `// Start one piece, then return. Check its URL in a later call.
async () => {
  const run = await codemode.request({
    method: "POST", path: "/api/run",
    body: { tractate: "Berakhot", page: "2a", mark_id: "argument-move" },
  });
  if (run.status === "pending") {
    return {
      ready: false,
      message: run.hint,
      checkUrl: run.checkUrl,
      retryAfterSeconds: run.retryAfterSeconds,
    };
  }
  // Keep error, paused, and skipped responses intact.
  return run;
}`;

const TOOLS = [
  {
    name: 'search',
    blurb:
      'Query the OpenAPI spec to discover endpoints. Call codemode.spec() and filter it in code. No request leaves the sandbox.',
  },
  {
    name: 'execute',
    blurb:
      'Run an async arrow function that calls codemode.request({ method, path, query, body }). Chain reads inside one function; only the returned value comes back.',
  },
];

const SECTIONS = [
  { id: 'connect', letter: 'א', label: 'Connect' },
  { id: 'tools', letter: 'ב', label: 'The two tools' },
  { id: 'example', letter: 'ג', label: 'Worked example' },
  { id: 'cold', letter: 'ד', label: 'Cold pages' },
  { id: 'access', letter: 'ה', label: 'Access' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function Margin(props: { id: SectionId }): JSX.Element {
  const s = SECTIONS.find((x) => x.id === props.id);
  return (
    <div class="read-margin">
      <span class="read-letter" lang="he">
        {s?.letter}
      </span>
      {s?.label}
    </div>
  );
}

function CopyButton(props: { text: string }): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  return (
    <button
      type="button"
      class="read-copy"
      classList={{ 'is-copied': copied() }}
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
    <div class="read-code">
      <CopyButton text={props.children} />
      <pre>
        <code>{props.children}</code>
      </pre>
    </div>
  );
}

export function McpPage(): JSX.Element {
  return (
    <main class="read-page" dir="ltr">
      <header class="read-head">
        <div class="read-margin read-margin-plain">MCP</div>
        <div class="read-head-row">
          <a href="#daf" class="read-wordmark">
            Talmud.dev
          </a>
          <nav class="read-nav" aria-label="Site">
            <a href="#daf">Reader</a>
            <a href="#about">About</a>
            <a href="#howitworks">How it works</a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <section class="read-sec read-hero">
        <div class="read-margin">
          <span class="read-letter read-letter-big" lang="he">
            תלמוד
          </span>
          {'For assistants '}
          <br />
          and their tools
        </div>
        <div class="read-col">
          <h1 class="read-title">Connect an assistant to the daf.</h1>
          <p>
            This app hosts a <strong>Model Context Protocol</strong> server, so an AI client can
            pull the same data the daf page is built from: text, context, the marks and enrichments
            that produce the anchors, sage data, and debug telemetry. It uses Cloudflare's{' '}
            <strong>code mode</strong>. Instead of dozens of separate tools there are two,{' '}
            <code>search</code> and <code>execute</code>, and the model writes small snippets that
            call the API and chain results in a single round trip.
          </p>
        </div>
      </section>

      <section id="connect" class="read-sec">
        <Margin id="connect" />
        <div class="read-col">
          <h3>Endpoint</h3>
          <Code>{MCP_URL}</Code>
          <h3>Add it to Claude Code</h3>
          <Code>{CLAUDE_CODE_CMD}</Code>
          <h3>Other MCP clients</h3>
          <p>
            Choose Streamable HTTP and enter the endpoint URL. Clients that accept the following
            JSON format can use it; other clients have their own settings:
          </p>
          <Code>{JSON_CONFIG}</Code>
        </div>
      </section>

      <section id="tools" class="read-sec">
        <Margin id="tools" />
        <div class="read-col">
          <ol class="read-list">
            <For each={TOOLS}>
              {(tool, i) => (
                <li>
                  <span class="read-n">{i() + 1}</span>
                  <div>
                    <div class="read-t">
                      <code>{tool.name}</code>
                    </div>
                    <div class="read-d">{tool.blurb}</div>
                  </div>
                </li>
              )}
            </For>
          </ol>
        </div>
      </section>

      <section id="example" class="read-sec">
        <Margin id="example" />
        <div class="read-col">
          <p>
            Start with{' '}
            <code>GET /api/daf-view/&#123;tractate&#125;/&#123;page&#125;?generate=1</code>: one
            call returns the cached notes and asks to generate missing pieces. Check the response:
            generation may be paused or unavailable.
          </p>
          <Code>{WORKED_EXAMPLE}</Code>
        </div>
      </section>

      <section id="cold" class="read-sec">
        <Margin id="cold" />
        <div class="read-col">
          <p>
            Generated notes are cached for later readers. A page with missing notes is
            <em> cold</em>. Generating a whole daf can take several minutes, and an individual piece
            can also take longer than one tool call. A partial <code>daf-view</code> says{' '}
            <code>complete: false</code> and lists missing pieces in <code>cold</code>. Read{' '}
            <code>generating</code> before saying work has started. The <code>hint</code> explains
            the current state. Use <code>checkUrl</code> for a later read and <code>readerUrl</code>{' '}
            to open the page.
          </p>
          <p>
            Each <code>execute</code> call has a 90-second limit. Return the cached notes and the
            follow-up URL without polling inside the script. This applies to a single piece too:
          </p>
          <Code>{PIECE_EXAMPLE}</Code>
          <p>
            Under the hood a daf page is text plus <em>marks</em> (structural extractors whose{' '}
            <code>excerpt</code>s are the anchors) and <em>enrichments</em> (LLM passes on a mark
            instance). Both run through <code>POST /api/run</code>.{' '}
            <a href={`${DOCS}/docs/mcp.md`} target="_blank" rel="noreferrer">
              The MCP and API guide
            </a>{' '}
            explains how to add or change an endpoint.
          </p>
        </div>
      </section>

      <section id="access" class="read-sec">
        <Margin id="access" />
        <div class="read-col">
          <p>
            The endpoint is open and read-focused. Connect and start pulling daf data right away.
            The examples use public routes. Starting generation depends on available credit and
            spending limits. A paused, skipped, or error response does not mean work is running.
            Custom prompts, model overrides, and maintenance operations require maintainer access.
          </p>
          <p>
            Use a client that supports the initialization handshake, including protocol version{' '}
            <code>2025-11-25</code>. Newer clients must allow fallback to that protocol. The server
            does not yet support the <code>2026-07-28</code> discovery protocol.
          </p>
        </div>
      </section>
    </main>
  );
}
