#!/usr/bin/env bash
# Start an agent worktree the standard way: branch from origin/master under
# .claude/worktrees/<branch> and install deps (fast - pnpm hardlinks from the
# shared store, and a real install is what wires up @corpus/core workspace links).
# Usage: scripts/worktree-new.sh <branch-name>
set -euo pipefail

branch="${1:?usage: worktree-new.sh <branch-name>}"
root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
path="$root/.claude/worktrees/$branch"

git fetch origin master --quiet
git worktree add "$path" -b "$branch" origin/master
(cd "$path" && pnpm install --frozen-lockfile)

echo ""
echo "Worktree ready: $path"
echo "When the PR is merged, clean up with: scripts/worktree-done.sh $branch"
