/**
 * Chapter inspector — a panel listing what's cached for the open chapter and
 * what each piece cost, the tanach analogue of the talmud reader's Inspect
 * waterfall. Reads GET /api/chapter-runs/:book/:chapter (the cache is the
 * index) and renders one row per producer piece: a hit/miss dot, its label
 * (+ verse/range), generation time, and cost. Rendered in the shared <Drawer>.
 */

import { Drawer } from '@corpus/ui/Drawer';
import { fmtCost, fmtMs, InspectorRow } from '@corpus/ui/InspectorRow';
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
                <InspectorRow
                  cached={run.cached}
                  label={run.label}
                  instance={run.instance}
                  coldMs={run.coldMs}
                  cost={run.cost}
                />
              )}
            </For>
          </>
        )}
      </Show>
    </Drawer>
  );
}
