/**
 * Chapter inspector — a panel listing what's cached for the open chapter and
 * what each piece cost, the tanach analogue of the talmud reader's Inspect
 * waterfall. Reads GET /api/chapter-runs/:book/:chapter (the cache is the
 * index) and renders one row per producer piece: a hit/miss dot, its label
 * (+ verse/range), generation time, and cost. Rendered in the shared <Drawer>.
 */

import { Drawer } from '@corpus/ui/Drawer';
import { createResource, For, type JSX, Show } from 'solid-js';

interface RunRow {
  id: string;
  label: string;
  instance: string | null;
  cached: boolean;
  model: string | null;
  coldMs: number | null;
  cost: number | null;
  tokens: number | null;
}
interface ChapterRuns {
  book: string;
  chapter: number;
  runs: RunRow[];
  totals: { count: number; cached: number; cost: number; coldMs: number };
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
function fmtCost(usd: number): string {
  return usd >= 0.01 || usd === 0 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(4)}`;
}

export function Inspector(props: {
  book: string;
  chapter: number;
  onClose: () => void;
}): JSX.Element {
  const [runs] = createResource(
    () => ({ book: props.book, chapter: props.chapter }),
    async (k) => {
      const res = await fetch(`/api/chapter-runs/${encodeURIComponent(k.book)}/${k.chapter}`);
      return res.ok ? ((await res.json()) as ChapterRuns) : null;
    },
  );

  return (
    <Drawer
      title={`${props.book} ${props.chapter}`}
      label="Inspect"
      dir="ltr"
      onClose={props.onClose}
    >
      <Show when={runs.loading}>
        <p class="comm-muted">Reading the cache…</p>
      </Show>
      <Show when={runs()}>
        {(r) => (
          <>
            <div class="inspect-totals">
              {r().totals.cached}/{r().totals.count} cached · {fmtCost(r().totals.cost)} ·{' '}
              {fmtMs(r().totals.coldMs)}
            </div>
            <For
              each={r().runs}
              fallback={<p class="comm-muted">Nothing cached yet for this chapter.</p>}
            >
              {(run) => (
                <div class="inspect-row">
                  <span
                    class="inspect-dot"
                    classList={{ hit: run.cached }}
                    title={run.cached ? 'cached' : 'not cached'}
                  />
                  <span class="inspect-label">
                    {run.label}
                    <Show when={run.instance}>
                      {(inst) => <span class="inspect-inst"> · {inst()}</span>}
                    </Show>
                  </span>
                  <span class="inspect-meta">
                    <Show when={run.cached} fallback={<span class="inspect-miss">miss</span>}>
                      <Show when={run.coldMs}>
                        {(ms) => <span class="inspect-ms">{fmtMs(ms())}</span>}
                      </Show>
                      <Show when={run.cost != null}>
                        <span class="inspect-cost">{fmtCost(run.cost ?? 0)}</span>
                      </Show>
                    </Show>
                  </span>
                </div>
              )}
            </For>
          </>
        )}
      </Show>
    </Drawer>
  );
}
