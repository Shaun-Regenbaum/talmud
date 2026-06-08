import { createResource, For, Show, type JSX } from 'solid-js';

interface UsageEntry {
  ts: number;
  ref: string;
  producer: string;
  model: string;
  in: number;
  out: number;
  cost: number | null;
}
interface UsageSummary {
  calls: number;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  byProducer: Record<string, { calls: number; costUsd: number }>;
  recent: UsageEntry[];
}

async function fetchUsage(): Promise<UsageSummary> {
  const res = await fetch('/api/usage');
  return (await res.json()) as UsageSummary;
}

const usd = (n: number) => `$${(n ?? 0).toFixed(4)}`;
const num = (n: number) => (n ?? 0).toLocaleString();
const when = (ts: number) => new Date(ts).toLocaleString();
const model = (m: string) => m.replace(/^openrouter\//, '');

/** Self-tracked LLM usage for the Tanach producers (from the KV ledger at
 *  /api/usage). Independent of the AI Gateway. */
export function UsagePage(): JSX.Element {
  const [u] = createResource(fetchUsage);

  return (
    <div class="usage">
      <header class="usage-top">
        <a class="usage-back" href="/">‹ Tanach</a>
        <h1>LLM Usage</h1>
      </header>

      <Show when={u.loading}>
        <p class="status">Loading…</p>
      </Show>

      <Show when={u()}>
        {(d) => (
          <>
            <div class="usage-cards">
              <div class="usage-card"><span class="k">Cost</span><span class="v">{usd(d().costUsd)}</span></div>
              <div class="usage-card"><span class="k">Calls</span><span class="v">{num(d().calls)}</span></div>
              <div class="usage-card"><span class="k">Tokens in</span><span class="v">{num(d().inTokens)}</span></div>
              <div class="usage-card"><span class="k">Tokens out</span><span class="v">{num(d().outTokens)}</span></div>
            </div>

            <h2>By producer</h2>
            <table class="usage-table">
              <thead><tr><th>Producer</th><th>Calls</th><th>Cost</th></tr></thead>
              <tbody>
                <For each={Object.entries(d().byProducer)} fallback={<tr><td colspan="3" class="muted">no calls yet</td></tr>}>
                  {([name, p]) => (
                    <tr><td>{name}</td><td>{num(p.calls)}</td><td>{usd(p.costUsd)}</td></tr>
                  )}
                </For>
              </tbody>
            </table>

            <h2>Recent calls</h2>
            <table class="usage-table">
              <thead><tr><th>When</th><th>Ref</th><th>Producer</th><th>Model</th><th>In</th><th>Out</th><th>Cost</th></tr></thead>
              <tbody>
                <For each={d().recent} fallback={<tr><td colspan="7" class="muted">no calls yet</td></tr>}>
                  {(e) => (
                    <tr>
                      <td class="muted">{when(e.ts)}</td>
                      <td>{e.ref}</td>
                      <td>{e.producer}</td>
                      <td class="muted">{model(e.model)}</td>
                      <td>{num(e.in)}</td>
                      <td>{num(e.out)}</td>
                      <td>{e.cost == null ? '—' : usd(e.cost)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </>
        )}
      </Show>
    </div>
  );
}
