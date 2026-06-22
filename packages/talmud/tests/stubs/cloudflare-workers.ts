// Test-only stub for the `cloudflare:workers` runtime module, which isn't
// resolvable under node/vitest. index.ts imports `WorkflowEntrypoint` at module
// scope to define DafWarmWorkflow; the warm Workflow isn't exercised by unit
// tests, so a no-op base class is all that's needed for the import to resolve.
// The REAL module is used at deploy (wrangler dry-run validates the binding) and
// tsc types come from @cloudflare/workers-types — the alias is vitest-only.
export class WorkflowEntrypoint {
  ctx: unknown;
  env: unknown;
  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}
