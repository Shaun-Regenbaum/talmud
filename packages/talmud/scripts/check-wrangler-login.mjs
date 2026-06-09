#!/usr/bin/env node
/**
 * Pre-flight check for `npm run dev`.
 *
 * Runs `wrangler whoami` and bails with a clear message when the login
 * session is expired. Without this, miniflare's auth token fetch returns
 * 401 → workerd can't dispatch ANY request → every endpoint returns the
 * generic `fetch failed` stack with no useful cause string. The user sees
 * apparent random crashes and has no signal that the cause is just an
 * expired wrangler login.
 *
 * Two `remote = true` bindings in wrangler.toml drive this requirement:
 *   - [ai]            (env.AI — direct Workers AI calls)
 *   - [[send_email]]  (env.EMAIL — email-service binding)
 * Both proxy through dash.cloudflare.com on first request; both 401 on
 * expired login.
 *
 * On miss, prints a clear "run `wrangler login` to refresh" message and
 * exits 1 so vite never starts in the broken state. On success, prints
 * one line and lets vite take over.
 *
 * Tolerates wrangler not being installed / network errors — those just
 * print a soft warning and let vite proceed (the user might be doing
 * something local-only).
 */
import { spawnSync } from 'node:child_process';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function banner(color, lines) {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const bar = '─'.repeat(width);
  console.error(`${color}┌${bar}┐${RESET}`);
  for (const line of lines) {
    const pad = ' '.repeat(width - line.length - 4);
    console.error(`${color}│${RESET}  ${line}${pad}  ${color}│${RESET}`);
  }
  console.error(`${color}└${bar}┘${RESET}`);
}

const result = spawnSync('npx', ['wrangler', 'whoami'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 15_000,
});

if (result.error) {
  // wrangler not installed, or some unrelated failure — soft warn and proceed.
  console.warn(
    `${DIM}[dev-precheck] wrangler whoami failed: ${result.error.message}; continuing${RESET}`,
  );
  process.exit(0);
}

const out = (result.stdout || '') + (result.stderr || '');
const notLoggedIn = /not authenticated|You are not logged in|expired|Unauthorized|401/i.test(out);

if (notLoggedIn) {
  banner(RED, [
    `${BOLD}Wrangler login is expired or missing.${RESET}${RED}`,
    '',
    'Two remote bindings in wrangler.toml require a fresh login:',
    '  • [ai]           — env.AI (Workers AI direct calls)',
    '  • [[send_email]] — env.EMAIL (Cloudflare Email Service)',
    '',
    'Without auth, miniflare will accept your first /api request,',
    'fail to fetch a Workers AI auth token (401), and return',
    '"fetch failed" for every subsequent request — including endpoints',
    'that do not touch AI or email at all.',
    '',
    `${BOLD}Fix:${RESET}${RED} run ${BOLD}wrangler login${RESET}${RED} and rerun ${BOLD}npm run dev${RESET}${RED}.`,
    '',
    `Bypass (skip the check) for one boot:`,
    `  ${BOLD}SKIP_WRANGLER_CHECK=1 npm run dev${RESET}${RED}`,
  ]);
  process.exit(1);
}

// Capture the account line so it's visible at boot — both confirms the
// check ran AND helps the user notice if they're logged into the wrong CF
// account (deploys would land in the wrong place).
const accountLine = out
  .split('\n')
  .find((l) => /Account|Email/i.test(l))
  ?.trim();
console.log(
  `${GREEN}✓${RESET} wrangler login OK${accountLine ? ` ${DIM}(${accountLine})${RESET}` : ''}`,
);
