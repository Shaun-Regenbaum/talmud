/**
 * Chapter inspector — the build-provenance WATERFALL for the open chapter, the
 * tanach analogue of the talmud reader's Inspect waterfall (same shared
 * @corpus/ui/RunWaterfall renderer). Reads GET /api/chapter-runs/:book/:chapter
 * (the cache is the index) and ranks each producer piece by cold-build time,
 * with its cost + cache status. Rendered in the shared <Drawer>.
 */

import { Drawer } from '@corpus/ui/Drawer';
import { RunWaterfall, type WaterfallRow } from '@corpus/ui/RunWaterfall';
import { createResource, type JSX, Show } from 'solid-js';

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

  // The chapter's producer runs as waterfall rows. `events` is a mark; the rest
  // are enrichments (drives the run-tree icon).
  const rows = (): WaterfallRow[] =>
    (runs()?.runs ?? []).map((r) => ({
      id: `${r.id}:${r.instance ?? ''}`,
      label: r.label,
      instance: r.instance,
      cached: r.cached,
      coldMs: r.coldMs,
      cost: r.cost,
      tokens: r.tokens,
      variant: r.id === 'events' ? 'mark' : 'enrichment',
    }));

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
          <RunWaterfall
            rows={rows()}
            totals={r().totals}
            emptyLabel="Nothing cached yet for this chapter."
          />
        )}
      </Show>
    </Drawer>
  );
}
