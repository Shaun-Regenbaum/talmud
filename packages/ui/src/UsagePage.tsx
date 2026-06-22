/**
 * @corpus/ui — UsagePage.
 *
 * The LLM-usage dashboard, shared by every corpus app. It is a pure PROJECTION
 * of a @corpus/core/telemetry UsageSummary (totals + per-producer / per-model /
 * per-ref breakdowns + the content-in/out cost split) — the app just fetches
 * its ledger and hands it over. Tabs switch the breakdown dimension; nothing
 * about the tables is hand-built per app. Styling: `.usage-*` in usage.css.
 */

import type { UsageBucket, UsageEntry, UsageSummary } from '@corpus/core/telemetry/types';
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';

const usd = (n: number) => `$${(n ?? 0).toFixed(4)}`;
const num = (n: number) => (n ?? 0).toLocaleString();
const model = (m: string) => m.replace(/^openrouter\//, '');
const tokens = (b: UsageBucket) =>
  b.tokensIn || b.tokensOut ? `${num(b.tokensIn)} / ${num(b.tokensOut)}` : '—';
const perCall = (b: UsageBucket) => (b.calls > 0 ? usd(b.costUsd / b.calls) : '—');

type Tab = 'producer' | 'model' | 'page' | 'recent';

function BucketTable(props: {
  nameHeader: string;
  buckets: Record<string, UsageBucket>;
  nameCell?: (name: string) => JSX.Element | string;
}): JSX.Element {
  const rows = createMemo(() =>
    Object.entries(props.buckets).sort((a, b) => b[1].costUsd - a[1].costUsd),
  );
  const maxCost = () => Math.max(...rows().map(([, b]) => b.costUsd), 0.000001);
  return (
    <table class="usage-table">
      <thead>
        <tr>
          <th>{props.nameHeader}</th>
          <th>Calls</th>
          <th>Tokens in/out</th>
          <th>In/out cost</th>
          <th>$/call</th>
          <th>Cost</th>
        </tr>
      </thead>
      <tbody>
        <For
          each={rows()}
          fallback={
            <tr>
              <td colspan="6" class="usage-empty">
                Nothing yet.
              </td>
            </tr>
          }
        >
          {([name, b]) => (
            <tr>
              <td class="usage-name">{props.nameCell ? props.nameCell(name) : name}</td>
              <td>{num(b.calls)}</td>
              <td>{tokens(b)}</td>
              <td>
                {b.costInUsd || b.costOutUsd ? `${usd(b.costInUsd)} / ${usd(b.costOutUsd)}` : '—'}
              </td>
              <td>{perCall(b)}</td>
              <td class="usage-cost-cell">
                <span class="usage-bar">
                  <span class="usage-fill" style={{ width: `${(b.costUsd / maxCost()) * 100}%` }} />
                </span>
                <span class="usage-cost">{usd(b.costUsd)}</span>
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

export interface UsagePageProps {
  summary: UsageSummary;
  recent: UsageEntry[];
  title?: string;
  /** Back-link target (e.g. "/" ) + label. */
  backHref?: string;
  backLabel?: string;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'producer', label: 'By producer' },
  { id: 'model', label: 'By model' },
  { id: 'page', label: 'By page' },
  { id: 'recent', label: 'Recent' },
];

export function UsagePage(props: UsagePageProps): JSX.Element {
  const [tab, setTab] = createSignal<Tab>('producer');
  const t = () => props.summary.totals;

  return (
    <div class="usage-page">
      <header class="usage-head">
        <Show when={props.backHref}>
          <a class="usage-back" href={props.backHref}>
            ‹ {props.backLabel ?? 'Back'}
          </a>
        </Show>
        <h1 class="usage-title">{props.title ?? 'LLM Usage'}</h1>
      </header>

      <div class="usage-cards">
        <div class="usage-card">
          <div class="usage-card-label">Cost</div>
          <div class="usage-card-value">{usd(t().costUsd)}</div>
        </div>
        <div class="usage-card">
          <div class="usage-card-label">Calls</div>
          <div class="usage-card-value">{num(t().calls)}</div>
        </div>
        <div class="usage-card">
          <div class="usage-card-label">Tokens in</div>
          <div class="usage-card-value">{num(t().tokensIn)}</div>
        </div>
        <div class="usage-card">
          <div class="usage-card-label">Tokens out</div>
          <div class="usage-card-value">{num(t().tokensOut)}</div>
        </div>
        <Show when={t().costInUsd || t().costOutUsd}>
          <div class="usage-card">
            <div class="usage-card-label">In / out cost</div>
            <div class="usage-card-value usage-card-split">
              {usd(t().costInUsd)} / {usd(t().costOutUsd)}
            </div>
          </div>
        </Show>
      </div>

      <div class="usage-tabs" role="tablist">
        <For each={TABS}>
          {(x) => (
            <button
              type="button"
              role="tab"
              class="usage-tab"
              classList={{ on: tab() === x.id }}
              aria-selected={tab() === x.id}
              onClick={() => setTab(x.id)}
            >
              {x.label}
            </button>
          )}
        </For>
      </div>

      <Show when={tab() === 'producer'}>
        <BucketTable nameHeader="Producer" buckets={props.summary.byProducer} />
      </Show>
      <Show when={tab() === 'model'}>
        <BucketTable nameHeader="Model" buckets={props.summary.byModel} nameCell={model} />
      </Show>
      <Show when={tab() === 'page'}>
        <BucketTable nameHeader="Page" buckets={props.summary.byRef} />
      </Show>
      <Show when={tab() === 'recent'}>
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
              each={props.recent}
              fallback={
                <tr>
                  <td colspan="7" class="usage-empty">
                    No recent calls.
                  </td>
                </tr>
              }
            >
              {(e) => (
                <tr>
                  <td>{new Date(e.ts).toLocaleString()}</td>
                  <td class="usage-name">{e.ref}</td>
                  <td>{e.producer}</td>
                  <td>{model(e.model)}</td>
                  <td>{num(e.tokensIn)}</td>
                  <td>{num(e.tokensOut)}</td>
                  {/* null = unpriced model (Workers AI etc.); keep it distinct from $0. */}
                  <td>{e.costUsd == null ? '—' : usd(e.costUsd)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  );
}
