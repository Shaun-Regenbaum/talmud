#!/usr/bin/env bash
# Finish an agent worktree after its PR squash-merged: delete the remote
# branch, remove the worktree, delete the local branch. Refuses if no merged
# PR exists for the branch or the worktree has uncommitted tracked changes
# (FORCE=1 overrides both). Run from the main checkout, not from inside the
# worktree being removed.
# Usage: scripts/worktree-done.sh <branch-name>
set -euo pipefail

branch="${1:?usage: worktree-done.sh <branch-name>}"
root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
path="$root/.claude/worktrees/$branch"

if [ "${FORCE:-}" != "1" ]; then
  merged="$(gh pr list --head "$branch" --state merged --json number --jq length 2>/dev/null || echo 0)"
  if [ "$merged" = "0" ]; then
    echo "worktree-done: no merged PR found for '$branch'." >&2
    echo "Merge it first, or FORCE=1 to clean up anyway (e.g. abandoned work)." >&2
    exit 1
  fi
  if [ -d "$path" ] && [ -n "$(git -C "$path" status --porcelain --untracked-files=no)" ]; then
    echo "worktree-done: '$path' has uncommitted tracked changes:" >&2
    git -C "$path" status --porcelain --untracked-files=no >&2
    echo "Commit or discard them, or FORCE=1 to discard via removal." >&2
    exit 1
  fi
fi

git push origin --delete "$branch" 2>/dev/null && echo "deleted remote branch $branch" \
  || echo "remote branch $branch already gone"
if [ -d "$path" ]; then
  git worktree remove --force "$path"
  echo "removed worktree $path"
fi
git branch -D "$branch" 2>/dev/null && echo "deleted local branch $branch" || true
