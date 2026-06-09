#!/usr/bin/env bash
# Runs before `wrangler deploy` (wired into each package's `ship` script).
# Blocks the two ways prod has silently diverged from master in this repo:
#   - deploying from a worktree whose content was never merged (a later deploy
#     from another agent then clobbers it), and
#   - deploying local uncommitted edits (e.g. a wrangler.toml mutated for dev).
# Override with SHIP_FORCE=1 when a divergent deploy is deliberate.
set -euo pipefail

if [ "${SHIP_FORCE:-}" = "1" ]; then
  echo "ship-guard: SHIP_FORCE=1 set, skipping checks"
  exit 0
fi

git fetch origin master --quiet

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ship-guard: BLOCKED - tracked files have uncommitted changes:" >&2
  git status --porcelain --untracked-files=no >&2
  echo "Commit (and merge) them first, or SHIP_FORCE=1 to deploy anyway." >&2
  exit 1
fi

if ! git diff --quiet origin/master HEAD --; then
  echo "ship-guard: BLOCKED - HEAD content differs from origin/master." >&2
  echo "Prod must match master. Merge your PR (and merge origin/master into" >&2
  echo "this branch if master moved), or SHIP_FORCE=1 to deploy anyway." >&2
  exit 1
fi

echo "ship-guard: OK (tree clean, content matches origin/master)"
