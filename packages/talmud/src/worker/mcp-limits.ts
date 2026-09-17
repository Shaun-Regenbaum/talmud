/**
 * Limits the code-mode MCP sandbox enforces, kept in one place so the OpenAPI
 * description (what the model is TOLD) and the executor (what actually
 * happens) cannot drift apart.
 */

/**
 * Wall-clock budget for one `execute` (or `search`) call. The codemode default
 * is 30 s, which is shorter than a single cold enrichment (p95 ~2 min), so a
 * model polling one piece hit "Execution timed out" instead of an answer. 90 s
 * lets one cold piece finish; a whole cold daf (~8 min) is deliberately NOT
 * covered — the spec tells the model to return early and be honest instead.
 */
export const MCP_EXECUTE_TIMEOUT_MS = 90_000;
