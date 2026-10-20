# Check a source-reading sample before expanding coverage

This runner reads up to 150 captured passages on the personal remote compute account.
It uses the existing pilot instructions, schema and quote validator without changing
reader cache keys. Results are initial readings, not approved identities or connections.

Each run freezes source hashes, code hashes, model settings and provider prices. Every
request has a saved dispatch receipt before it starts. Responses and progress are saved
on a persistent volume. A resumed run rechecks completed answers and never automatically
retries a request whose charge is unknown.

The run reserves the maximum output cost and a conservative input allowance before each
request. It stops at $3, eight recent failures, or a response costing more than its
reservation. The existing non-resetting $100 key limit must still be in place. Completed
runs and failed attempts both count against that key. A fresh run does not reset it.

The cheapest eligible provider is selected from a fresh quote. Routes with observed
failures are excluded. Provider fallback is disabled and maximum prices are sent with
each request. Reasoning effort is explicit because the default consumed the entire
output budget without returning an answer in a source-reading probe.

Supply a JSON bundle with `runId`, `jobs` and `jobsSha256` (the canonical sorted JSON
hash of `jobs`). Each job uses the pilot contract and captured source text. Keep bundles,
results and billing receipts in the private research folder, outside Git.

Deploy `pilot_job.py` to the personal profile, then invoke its `launch` entrypoint with
`--bundle` and `--receipt`. Launch uses the deployed function so the run survives the
local command exiting. The `status` function reports saved completion and failure counts.
A three-job diagnostic uses two concurrent requests; larger samples use eight.

Do not expand from a successful schema check alone. Compare a spread sample against
independent readings of the same sources, including missed names, family references,
hypothetical cases and unclear speakers. `needs_context` remains incomplete coverage.
