# Working in this repo

Talmud study app: Hono on Cloudflare Workers (`src/worker`) + Solid.js/Vite client (`src/client`), shared logic in `src/lib`. Package manager is **pnpm**. TypeScript strict.

- `pnpm test` — Vitest unit suite. `pnpm test:int` — integration (hits a running worker).
- `pnpm typecheck` — `tsc --noEmit`. Run it plus `pnpm test` before any PR.
- `pnpm ship` — `vite build && wrangler deploy`. Production is the custom domain **talmud.shaunregenbaum.com**. wrangler is authenticated in this environment.

## Multiple agents work this repo at once — isolate in a worktree

This repo is routinely worked by several agents in parallel (it is normal to see many `.claude/worktrees/*`). The shared main checkout is frequently dirty with another agent's uncommitted work. **Do not edit or commit code in the main checkout** — you will corrupt their work or sweep it into your commit. A real collision has happened here (two agents editing `src/worker/llm.ts` at once broke the build).

Instead, for any code change:

1. **Branch in a worktree first.** Create a git worktree on a new branch before touching code. Worktrees branch from `origin/master`/HEAD, so they exclude others' uncommitted work — that is the point.
2. **Run from the worktree.** If `node_modules` is missing there, symlink it from the main tree (`ln -s <repo>/node_modules ./node_modules`) rather than reinstalling. Then `pnpm typecheck` and `pnpm test`.
3. **PR → merge.** Commit on the branch, push, open a PR (`gh pr create`), and merge it (`gh pr merge <n> --squash --admin`). GitHub blocks self-approval, so the repo owner authorizes admin-merge.
4. **Expect master to move.** Other agents push often. If a PR won't merge, `git merge origin/master` in the worktree, resolve, push (GitHub recomputes mergeability a few seconds later).
5. **Deploy from the worktree** with `pnpm ship` when the change should go live.
6. **Clean up.** Delete the remote branch and remove the worktree + local branch (the work lives on master via the squash).

## Commit / PR text

No self-reference and no `Co-Authored-By` trailer in commit messages. Omit any "Generated with …" footer from PR bodies too, since a squash-merge folds the PR body into the master commit message.
