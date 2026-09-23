# Contributing with an AI assistant

Most of this reader was written with AI coding assistants, and the repository is arranged so that an assistant can be useful from the first minute. This page says how to work that way well, and the few things an assistant must never do here.

## What the repo gives an assistant

- **A briefing.** `AGENTS.md` at the root is the file any agent should read first: what the repo is, the commands, the rules. `CLAUDE.md` is the Claude-specific copy with the project log.
- **A worktree per change.** Several agents work this repo at the same time, so the main checkout is often dirty with someone else's work. `scripts/worktree-new.sh <branch>` gives your change its own checkout from `origin/staging`. Never edit the main checkout.
- **Checks that need no secrets.** `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all run offline. An assistant can iterate until they pass without touching production or spending money.
- **A model it can read.** `docs/framework.md` is the engine in the vocabulary of the code. The live page [talmud.dev/#howitworks](https://talmud.dev/#howitworks) shows the same four ideas on a real daf, with the build graph drawn from the running registry.
- **The corpus itself.** The MCP server lets an assistant read any daf and its notes while it works:

```bash
claude mcp add --transport http talmud https://talmud.dev/mcp
```

or, for clients that take a JSON block:

```json
{ "mcpServers": { "talmud": { "url": "https://talmud.dev/mcp" } } }
```

[mcp.md](mcp.md) explains what the server exposes.

## Give the assistant the right three things

A good opening prompt names the briefing, the document for the area, and the test that covers the code:

> Read AGENTS.md. This change is about the study sources; read docs/sources.md. The tests for the source registry are packages/talmud/tests/context-sources.test.ts. Then: <what you want>.

That is usually enough. Paste the failing test output rather than describing it.

## What a good AI-assisted pull request looks like

The same as a good human one, with one extra line.

- One purpose, small enough to read in ten minutes.
- The four checks run and passing. Say so in the pull request.
- A screenshot for anything visible. Look at the screenshot yourself; do not trust a description of it.
- The "Written with AI help" line in the pull request template filled in honestly: which tool, what it wrote, and what you checked yourself. The reviewer treats the pull request as your work, because it is. The line is there so review effort goes where it is needed, not to judge the tool.
- If the change touches a cache key, a `cache_version`, a prompt, or an output schema, the description says which and why. See [code-style.md](code-style.md).

## Rules the assistant must follow

These are the places where a fluent model does the most damage, because the output looks right.

1. **Never invent a source.** No made-up citation, page reference, rabbi identity, place, date, or translation. If the model cannot find it in the text or in a source it can point at, it says so. The reader's whole design is that a wrong note is worse than no note.
2. **No placeholder data without saying so.** Do not let the assistant write mock JSON, sample rabbis, or invented fixtures into the repo. If a test needs a fixture, capture a real one and record where it came from, as the files in `packages/talmud/tests/fixtures` do.
3. **Do not change cache keys or recipes casually.** A one-character change to a key derivation cold-misses every cached page in Shas. The golden tests will catch some of this; the pull request description must catch the rest.
4. **Never overwrite a human correction.** The store refuses it; do not work around the store.
5. **Never commit a secret.** `.githooks/pre-commit` scans staged files for key patterns. Keys go in `.dev.vars`, which is gitignored.
6. **Keep the reader's words plain.** No jargon on screen. Every string through the `t()` catalog with both languages. Hebrew is written as Hebrew.
7. **Keep AI out of the commit text.** No assistant or vendor names, no "generated with" line, no `Co-Authored-By` trailer, whatever the tool's default is. The disclosure line in the pull request template is the one place for it.

## Ask a second model to review

Before opening the pull request, have a different model review the diff read-only and argue with it. The repository owner does this with `codex exec --sandbox read-only`; any capable model works. Ask it for the ways the change could be wrong, not for approval. Fix what it finds or say in the pull request why you did not.

## When the assistant finds a wrong note

Working with the MCP server, an assistant will sometimes notice that a generated note is misplaced, names the wrong sage, or mistranslates. That is a data contribution. File it with the "Wrong or misplaced note" issue template, with the tractate and page, the note, what is wrong, and a source that shows the right answer. Human corrections outrank everything the machine produces. [data.md](data.md) explains what can be fixed in the repo directly.

## What not to delegate

- Deciding whether a change is worth a cold-miss of the cache.
- Writing history, credits, or anything about real people.
- Merging. Pull requests are reviewed and merged by a maintainer.
