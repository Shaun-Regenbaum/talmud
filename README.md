# Talmud

**A daf-first study reader that covers the Vilna page in smart, source-aware notes.**

[Open the reader](https://talmud.dev) · [Take the guided tour](https://talmud.dev/#tutorial) · [See how it works](https://talmud.dev/#howitworks) · [About the project](https://talmud.dev/#about)

[![Release](https://github.com/Shaun-Regenbaum/talmud/actions/workflows/release.yml/badge.svg?branch=staging)](https://github.com/Shaun-Regenbaum/talmud/actions/workflows/release.yml)

[![Talmud.dev showing Berakhot 2a with an anchored daf overview and argument map](docs/assets/talmud-reader.jpg)](https://talmud.dev)

Talmud.dev keeps the daf at the center of study. It layers explanations and connections onto the text at the place where they belong, and every note says where it came from, how it was made, and how precisely it was placed. When the system cannot place a note confidently, it leaves it on the whole daf rather than guess.

It started in 2019 as a Georgia Tech digital-humanities project by Shaun Regenbaum and Dan Jutan. Their layout library, [daf-renderer](https://github.com/TalmudLab/daf-renderer), is still underneath. The rest of the story is on the [About page](https://talmud.dev/#about).

## What it does

- Renders the Vilna daf with tractate, page, language, and Daf Yomi navigation.
- Pins background, argument structure, practical halacha, Rishonim, citations, geography, people, parallels, and other study aids to the words they are about.
- Turns a daf's argument into navigable sections, voice maps, and cross-daf links.
- Writes every note in English and in Hebrew, with word-level translation, commentary, and questions.
- Exposes the same corpus through a documented API and an MCP server, so an AI assistant can read a daf the way a person does.
- Shows how it is working: provenance, dependency graphs, cache state, usage, and generation status are on screen, not hidden.

Human corrections outrank generated results and are never silently overwritten.

## How it is built

A pnpm workspace with two readers and a shared engine:

| Path | Purpose |
| --- | --- |
| `packages/talmud` | The Solid.js reader and Hono/Cloudflare Workers API at [talmud.dev](https://talmud.dev) |
| `packages/tanach` | The sibling [Tanach reader](https://tanach.dev), on the same engine |
| `packages/core` | Corpus-agnostic spines, anchors, artifacts, producers, the store, the runtime, cost controls |
| `packages/ui` | Shared components and design tokens |

The model is four ideas: an addressable text (a **spine**) is covered by typed notes (**artifacts**), each pinned by an **anchor** and made by a registered **producer**. [docs/architecture.md](docs/architecture.md) is the map; [docs/framework.md](docs/framework.md) is the reference.

## Get it running

Requirements: Node.js 22+, [pnpm 9.12.1](https://pnpm.io/), Git. No credentials are needed for the checks.

```bash
git clone https://github.com/Shaun-Regenbaum/talmud.git
cd talmud
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

Running the reader locally (`pnpm dev`) needs a Wrangler login because two bindings are remote. [docs/local-dev.md](docs/local-dev.md) explains each level, including what works with an empty cache and how to look at UI without the dev server.

## Ways in

| You want to | Start with |
| --- | --- |
| Improve the reader: the page, the cards, navigation, mobile | [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/code-style.md](docs/code-style.md) |
| Extend the MCP server or the API | [docs/mcp.md](docs/mcp.md) |
| Improve the data: report a wrong note, fix a sage, a place, a source | [docs/data.md](docs/data.md) and the [wrong-note report](https://github.com/Shaun-Regenbaum/talmud/issues/new?template=content_issue.yml) |
| Learn how it is built, or fix the docs | [docs/README.md](docs/README.md) |
| Pick something to work on | [docs/roadmap.md](docs/roadmap.md), [`good first issue`](https://github.com/Shaun-Regenbaum/talmud/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) |

Connect an assistant to the corpus in one line:

```bash
claude mcp add --transport http talmud https://talmud.dev/mcp
```

**Using an AI assistant to contribute?** Good. Much of this reader was built that way. Read [docs/contributing-with-ai.md](docs/contributing-with-ai.md) first: it says what the repo gives an agent, what a good AI-assisted pull request looks like, and the few things an assistant must never do here.

Before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Changes merge into `staging` first and deploy to staging.talmud.dev for review. Production updates after the maintainer approves that version. See [docs/deployment.md](docs/deployment.md).

## Sources and license

The code is MIT licensed (see [LICENSE](LICENSE)). The texts and study material the readers show stay under their own terms: Sefaria for the text and commentary links, HebrewBooks for the printed-page typography, Kollel Iyun HaDaf for per-daf study aids. The full credits are on the [About page](https://talmud.dev/#about/credits). Conduct and security reporting: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md).
