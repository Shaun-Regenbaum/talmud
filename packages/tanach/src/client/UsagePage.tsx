import { createResource, For, type JSX, Show } from 'solid-js';

interface UsageEntry {
  ts: number;
  ref: string;
  producer: string;
  model: string;
  in: number;
  out: number;
  cost: number | null;
}
interface BucketUsage {
  calls: number;
  costUsd: number;
  // Absent on buckets recorded before token tracking existed.
  inTokens?: number;
  outTokens?: number;
}
interface UsageSummary {
  calls: number;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  byProducer: Record<string, BucketUsage>;
  byModel?: Record<string, BucketUsage>;
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
const tokens = (b: BucketUsage) =>
  b.inTokens || b.outTokens ? `${num(b.inTokens ?? 0)} / ${num(b.outTokens ?? 0)}` : '—';
const perCall = (b: BucketUsage) => (b.calls > 0 ? usd(b.costUsd / b.calls) : '—');

function byCostDesc(entries: Record<string, BucketUsage>): Array<[string, BucketUsage]> {
  return Object.entries(entries).sort((a, b) => b[1].costUsd - a[1].costUsd);
}

/** A bucket table (producers or models): cost-sorted, with a relative cost
 *  share bar, tokens (where recorded), and average cost per call. */
function BucketTable(props: {
  label: string;
  buckets: Record<string, BucketUsage>;
  nameCell?: (name: string) => JSX.Element | string;
}): JSX.Element {
  const rows = () => byCostDesc(props.buckets);
  const maxCost = () => Math.max(...rows().map(([, b]) => b.costUsd), 0.000001);
  return (
    <table class="usage-table">
      <thead>
        <tr>
          <th>{props.label}</th>
          <th>Calls</th>
          <th>Tokens in/out</th>
          <th>$/call</th>
          <th>Cost</th>
        </tr>
      </thead>
      <tbody>
        <For
          each={rows()}
          fallback={
            <tr>
              <td colspan="5" class="muted">
                no calls yet
              </td>
            </tr>
          }
        >
          {([name, b]) => (
            <tr>
              <td>{props.nameCell ? props.nameCell(name) : name}</td>
              <td>{num(b.calls)}</td>
              <td class="muted">{tokens(b)}</td>
              <td class="muted">{perCall(b)}</td>
              <td>
                <span class="usage-cost-cell">
                  <span
                    class="usage-cost-bar"
                    style={{ width: `${Math.max(2, (b.costUsd / maxCost()) * 72)}px` }}
                  />
                  {usd(b.costUsd)}
                </span>
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

/** Self-tracked LLM usage for the Tanach producers (from the KV ledger at
 *  /api/usage). Independent of the AI Gateway. */
export function UsagePage(): JSX.Element {
  const [u] = createResource(fetchUsage);

  return (
    <div class="usage">
      <header class="usage-top">
        <a class="usage-back" href="/">
          ‹ Tanach
        </a>
        <h1>LLM Usage</h1>
      </header>

      <Show when={u.loading}>
        <p class="status">Loading…</p>
      </Show>

      <Show when={u()}>
        {(d) => (
          <>
            <div class="usage-cards">
              <div class="usage-card">
                <span class="k">Cost</span>
                <span class="v">{usd(d().costUsd)}</span>
              </div>
              <div class="usage-card">
                <span class="k">Calls</span>
                <span class="v">{num(d().calls)}</span>
              </div>
              <div class="usage-card">
                <span class="k">Tokens in</span>
                <span class="v">{num(d().inTokens)}</span>
              </div>
              <div class="usage-card">
                <span class="k">Tokens out</span>
                <span class="v">{num(d().outTokens)}</span>
              </div>
            </div>

            <h2>By producer</h2>
            <BucketTable label="Producer" buckets={d().byProducer} />

            <Show when={Object.keys(d().byModel ?? {}).length > 0}>
              <h2>By model</h2>
              <BucketTable label="Model" buckets={d().byModel ?? {}} nameCell={model} />
            </Show>

            <h2>Recent calls</h2>
            <table class="usage-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Ref</th>
                  <th>Producer</th>
                  <th>Model</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={d().recent}
                  fallback={
                    <tr>
                      <td colspan="7" class="muted">
                        no calls yet
                      </td>
                    </tr>
                  }
                >
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
