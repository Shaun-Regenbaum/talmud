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

  if (!view.complete) {
    // A whole daf takes ~8 minutes. Do not poll here — hand back
    // what exists and where to look, and let the user ask again.
    return {
      ready: false,
      have: Object.keys(view.pieces),
      stillGenerating: view.cold,
      message: view.hint,        // one plain sentence, ready to relay
      readerUrl: view.readerUrl, // the human page, fills in live
      checkUrl: view.checkUrl,   // re-read this next time
    };
  }

  return { ready: true, pieces: view.pieces };
}`;

const PIECE_EXAMPLE = `// One piece at a time: POST /api/run is async. A cold piece
// takes ~20-120 s, so polling ONE piece inside execute is fine.
async () => {
  let run = await codemode.request({
    method: "POST", path: "/api/run",
    body: { tractate: "Berakhot", page: "2a", mark_id: "argument-move" },
  });
  const deadline = Date.now() + 60_000; // stay under the 90 s sandbox limit
  while (run.status === "pending" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, (run.retryAfterSeconds ?? 15) * 1000));
    run = await codemode.request({
      method: "GET",
      path: \`/api/run-status/\${run.runId}\`,
      query: { k: run.cacheKey },
    });
  }
  if (run.status === "pending") {
    return { ready: false, message: run.hint, checkUrl: run.checkUrl };
  }
  return run.result?.parsed?.instances ?? run;
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
      'Run an async arrow function that calls codemode.request({ method, path, query, body }). Chain calls and poll inside one function; only the returned value comes back.',
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
          <h3>Or add it to any MCP client</h3>
          <p>For Claude Desktop and other clients that take a streamable-HTTP server by URL:</p>
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
            call returns every piece the daf already has, and starts generating the rest if any are
            missing.
          </p>
          <Code>{WORKED_EXAMPLE}</Code>
        </div>
      </section>

      <section id="cold" class="read-sec">
        <Margin id="cold" />
        <div class="read-col">
          <p>
            Pages are generated the first time anyone opens them and cached forever after. A page
            nobody has visited yet is <em>cold</em>: a whole daf takes about eight minutes to fill
            in, and one piece takes 20 seconds to two minutes. The API never hides this. A partial{' '}
            <code>daf-view</code> says <code>complete: false</code>, lists what is still{' '}
            <code>cold</code>, says whether it is <code>generating</code>, and gives a{' '}
            <code>checkUrl</code> to re-read plus a <code>readerUrl</code> where a person can watch
            the page fill in live. A <code>hint</code> field carries the sentence to relay.
          </p>
          <p>
            The <code>execute</code> sandbox stops a script after 90 seconds. So the rule for a cold
            daf is: return what exists, say the rest is on its way, and check again next time.
            Waiting inside one call only produces a timeout. Polling a single piece is fine:
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
            Everything in the examples above works on the public endpoint. A few advanced operations
            are reserved for the maintainer and return an authorization error if called.
          </p>
        </div>
      </section>
    </main>
  );
}
