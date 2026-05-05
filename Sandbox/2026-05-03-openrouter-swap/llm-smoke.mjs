// Phase 0 smoke test — hits /api/admin/ai-gateway-test for each model.
// Run with the dev server up:  bun run dev   (or)  npx vite
// Then:  node Sandbox/2026-05-03-openrouter-swap/llm-smoke.mjs
//
// Override the base URL if needed:
//   URL=http://localhost:8787 node Sandbox/.../llm-smoke.mjs

const URL_BASE = process.env.URL ?? 'http://localhost:5173';

const MODELS = [
  '@cf/moonshotai/kimi-k2.5',                   // baseline (Workers AI)
  'openrouter/deepseek/deepseek-chat-v3.1',     // cheap, fast
  'openrouter/deepseek/deepseek-v3.2-exp',      // V3.2 sparse-attention model
  'openrouter/z-ai/glm-4.6',                    // GLM frontier
  'openrouter/anthropic/claude-sonnet-4.5',     // Sonnet baseline
  'openrouter/google/gemini-2.5-flash',         // Gemini Flash
];

console.log(`URL=${URL_BASE}`);
console.log('model\tstatus\ttransport\tms\ttotal_tokens\treply');
for (const model of MODELS) {
  const url = `${URL_BASE}/api/admin/ai-gateway-test?run=1&model=${encodeURIComponent(model)}&nonce=${Date.now()}`;
  const t0 = Date.now();
  let payload;
  let status = '?';
  try {
    const res = await fetch(url);
    status = String(res.status);
    payload = await res.json();
  } catch (err) {
    console.log(`${model}\tFETCH_ERR\t-\t${Date.now() - t0}\t-\t${err?.message ?? err}`);
    continue;
  }
  const transport = payload?.transport ?? '-';
  const ms = payload?.ms ?? Date.now() - t0;
  const tokens = payload?.usage?.total_tokens ?? '-';
  const reply = (payload?.reply ?? payload?.error ?? '').toString().replace(/\s+/g, ' ').slice(0, 80);
  console.log(`${model}\t${status}\t${transport}\t${ms}\t${tokens}\t${reply}`);
}
