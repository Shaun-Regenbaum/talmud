#!/usr/bin/env bash
# Create or update the repository's issue labels so triage uses one vocabulary.
# Safe to re-run: `--force` updates colour and description on an existing label
# and never deletes anything. Usage: scripts/sync-labels.sh [owner/repo]
set -euo pipefail

repo="${1:-Shaun-Regenbaum/talmud}"

label() {
  gh label create "$1" --repo "$repo" --color "$2" --description "$3" --force >/dev/null
  echo "  $1"
}

echo "Syncing labels on $repo"

# What kind of change
label "bug"              "d73a4a" "Something is broken"
label "content"          "b60205" "A generated note is wrong, misplaced, or mistranslated"
label "enhancement"      "a2eeef" "A new feature or an improvement"
label "documentation"    "0075ca" "Docs, guides, comments, and the how-it-works pages"
label "question"         "d876e3" "A question about the app, the text, or the code"

# Where it lives
label "area: reader"     "8a2a2b" "The daf page, cards, navigation, mobile"
label "area: engine"     "5319e7" "Producers, placement, caching, provenance (packages/core)"
label "area: mcp-api"    "0e8a16" "The MCP server and the public API"
label "area: data"       "fbca04" "Rabbi registry, gazetteer, study sources, benchmarks"
label "area: tanach"     "1d76db" "The Tanach reader"
label "area: ops"        "6f42c1" "Deploys, Cloudflare bindings, cost controls, CI"

# For newcomers and triage
label "good first issue" "7057ff" "Small, well-scoped, with pointers to the code"
label "help wanted"      "008672" "Ready for someone to pick up"
label "needs source"     "e4e669" "A content report that needs a checkable source before it can be fixed"
label "duplicate"        "cfd3d7" "Already reported"
label "wontfix"          "ffffff" "Will not be worked on"

echo "Done."
