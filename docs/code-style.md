# Code style

Most of this is enforced by tools. The rest is the habits the codebase already has. Match what is around you.

## Formatting and linting

Biome does both. The configuration is `biome.json` at the root: two-space indent, 100-column lines, single quotes, semicolons always, trailing commas everywhere. Generated data files and map geometry are excluded there.

```bash
pnpm lint      # biome check .
pnpm format    # biome format --write .
```

CI runs `biome ci .` and fails on errors. Run `pnpm lint` before you push.

## TypeScript

`strict` is on, with `noImplicitOverride` and `verbatimModuleSyntax` (`tsconfig.base.json`). Each package extends it. `pnpm typecheck` runs `tsc --noEmit` in every package.

Tests in `packages/talmud` and `packages/tanach` are not typechecked today (their `tsconfig.json` includes only `src/`). If you fix that, expect a batch of errors to clean up; see [roadmap.md](roadmap.md).

## Files and names

- Solid components are `PascalCase.tsx` (`DafViewer.tsx`, `AboutPage.tsx`). Modules are `camelCase.ts` (`dafViewStore.ts`) or `kebab-case.ts` in the worker (`cache-keys.ts`).
- Tests live in `packages/<pkg>/tests`, named after what they cover: `foo.test.ts` for Node, `foo.test.tsx` for jsdom client tests (the Vitest config in `packages/talmud/vitest.config.ts` runs the two as separate projects).
- Engine code that both apps need goes in `packages/core` and is imported as `@corpus/core/<area>/<module>`. Shared look and feel goes in `packages/ui`.

## Comments explain why

The repo's habit is long comments at the point of a decision, recording the reason and the evidence. The `[[workflows]]` block in `packages/talmud/wrangler.toml` explains a whole architectural split; the top of `packages/talmud/src/worker/ai-credits.ts` explains a bug and its fix. Do the same when you make a non-obvious choice. Do not narrate what the code plainly does.

No emojis in code, comments, or logs.

## Words the reader sees

- Plain English. Prefer "everyday objects" to "realia", "setting" to "milieu". If you would not say the word out loud to a study partner, do not put it on screen.
- Every UI string goes through `t()` in `packages/talmud/src/client/i18n.ts`, with an English and a Hebrew entry. The Tanach app has the same pattern.
- Hebrew is written as Hebrew. Generated notes have a Hebrew prompt variant; they are not translated from the English output.
- Long-form pages written in one language (the About page, the MCP guide) say so in a comment at the top.

## Rules that protect the data

- Cache keys and producer recipes are frozen. Changing one cold-misses every cached page. If your pull request touches `packages/core/src/cache/keys.ts`, a `cache_version`, a prompt, or an output schema, say so in the description and say why it is worth it.
- Human corrections are never overwritten by generated output. The store enforces it; do not work around it.
- Precision over recall for placement. A note pinned to the wrong words is worse than a note pinned to the whole daf.
- No mock or placeholder data in the repo without saying so clearly in the pull request. Fixtures under `tests/fixtures` are real captured data with provenance.

## Commits and pull requests

- The subject line is imperative and says what a reader or a caller will notice: "Make cold dapim honest for MCP and API callers", not "Update daf-view".
- One purpose per pull request. Small is easier to review and easier to revert.
- Repository rule, whatever tool you write with: commit messages, pull request text, and code comments carry no reference to an AI assistant or its vendor, no "generated with" line, and no `Co-Authored-By` trailer. The pull request template has a line for AI disclosure; that is the place for it.
