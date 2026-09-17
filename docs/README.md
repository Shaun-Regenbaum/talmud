# Documentation index

Start with the question you have. Each row points at the one document that answers it.

| You want to | Read |
| --- | --- |
| Understand what the app is and where it came from | [talmud.dev/#about](https://talmud.dev/#about) |
| Get the code running and the checks passing | [local-dev.md](local-dev.md) |
| See how the pieces fit: workers, cache, generation, MCP | [architecture.md](architecture.md) |
| Learn the data model in the vocabulary of the code | [framework.md](framework.md) |
| Add a study source (a commentary, a study aid, a topic feed) | [sources.md](sources.md) |
| Know what data ships in the repo, what lives in the cache, and how to fix a wrong entry | [data.md](data.md) |
| Connect an AI assistant to the corpus, or extend the MCP server and API | [mcp.md](mcp.md) |
| Contribute with an AI coding assistant | [contributing-with-ai.md](contributing-with-ai.md) |
| Match the house code style | [code-style.md](code-style.md) |
| Pick something to work on | [roadmap.md](roadmap.md) |
| Understand how request costs are recorded | [cost-accounting.md](cost-accounting.md) |
| Follow the research plan for measuring accuracy | [research-plan.md](research-plan.md) and [../research/pilot-v1/README.md](../research/pilot-v1/README.md) |
| Read the section-typing design note | [section-typing.md](section-typing.md) (a design note from before the four-primitive consolidation; the vocabulary moved to `@corpus/core`, the design still applies) |

The contributor workflow itself (worktree, checks, pull request) is in [../CONTRIBUTING.md](../CONTRIBUTING.md). The briefing an AI agent reads before touching the repo is [../AGENTS.md](../AGENTS.md).

## How the documents relate

- `architecture.md` is the map. It names the workers, the cache, the generation path, and the MCP server, with file paths.
- `framework.md` is the reference for the engine in `packages/core`: Spine, Anchor, Artifact, Producer, the store, the runtime.
- `sources.md`, `data.md`, and `mcp.md` are the three doors for contributors who are not changing the engine: study sources, data, and the machine interface.
- `local-dev.md`, `code-style.md`, and `contributing-with-ai.md` are about how to work here.
- `roadmap.md` is what is open, with a list a newcomer can pick from.

## Live pages that double as documentation

- [talmud.dev/#howitworks](https://talmud.dev/#howitworks) walks the four primitives on a real daf and draws the live build graph from the running registry.
- [talmud.dev/#tutorial](https://talmud.dev/#tutorial) is the reader's guided tour, on Berakhot 8a.
- [talmud.dev/#mcp](https://talmud.dev/#mcp) is the connect guide for MCP clients.
- [talmud.dev/#usage](https://talmud.dev/#usage) shows generation cost, cache health, and traffic.
