/**
 * Limits the code-mode MCP sandbox enforces, re-exported from the shared
 * server so the OpenAPI description (what the model is TOLD) and the executor
 * (what actually happens) cannot drift apart.
 */
export { DEFAULT_EXECUTE_TIMEOUT_MS as MCP_EXECUTE_TIMEOUT_MS } from '@corpus/core/mcp/code-mode';
