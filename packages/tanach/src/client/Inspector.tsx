/**
 * Chapter inspector — the build-provenance surfaces for the open chapter, the
 * tanach analogue of the talmud reader's Inspect dock, on the SAME shared
 * renderers. A WATERFALL (every cached producer piece, ranked by cold-build
 * time — @corpus/ui/RunWaterfall over GET /api/chapter-runs); click a piece to
 * open its dependency DAG (@corpus/ui/RunTreeDag over GET /api/run-tree, derived
 * by core buildRunTree from the producer registry). Tanach producers depend only
 * on sources, so each DAG is one level (piece → its inputs) and the registry's
 * `isExpandable` is false for all — surfaced as a note, not hidden. Shown in the
 * shared <Drawer>.
 */

import { Drawer } from '@corpus/ui/Drawer';
import type { RunTree } from '@corpus/ui/RunTree';
import { RunTreeDag } from '@corpus/ui/RunTreeDag';
import { RunWaterfall, type WaterfallRow } from '@corpus/ui/RunWaterfall';
import { createResource, createSignal, type JSX, Show } from 'solid-js';

interface RunRow {
  id: string;
  label: string;
  instance: string | null;
  instanceRaw: string | null;
  expandable: boolean;
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

interface Picked {
  id: string;
  label: string;
  instanceRaw: string | null;
  expandable: boolean;
}

export function Inspector(props: {
  book: string;
  chapter: number;
  lang?: 'en' | 'he';
  onClose: () => void;
}): JSX.Element {
  const [runs] = createResource(
    () => ({ book: props.book, chapter: props.chapter }),
    async (k) => {
      const res = await fetch(`/api/chapter-runs/${encodeURIComponent(k.book)}/${k.chapter}`);
      return res.ok ? ((await res.json()) as ChapterRuns) : null;
    },
  );

  // A unique waterfall-row id per piece+instance, so clicking maps back to the
  // exact producer to open in the DAG.
  const rowKey = (r: RunRow) => `${r.id}:${r.instanceRaw ?? ''}`;
  const rows = (): WaterfallRow[] =>
    (runs()?.runs ?? []).map((r) => ({
      id: rowKey(r),
      label: r.label,
      instance: r.instance,
      cached: r.cached,
      coldMs: r.coldMs,
      cost: r.cost,
      tokens: r.tokens,
      // `events` is a mark; the rest are enrichments (drives the node icon).
      variant: r.id === 'events' ? 'mark' : 'enrichment',
    }));

  const [picked, setPicked] = createSignal<Picked | null>(null);
  // Node selection + expansion WITHIN the DAG (the shared component is controlled).
  const [dagSel, setDagSel] = createSignal<string | null>(null);
  const [dagExp, setDagExp] = createSignal<Set<string>>(new Set());
  const toggle = (id: string) =>
    setDagExp((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const onSelect = (key: string) => {
    const r = (runs()?.runs ?? []).find((x) => rowKey(x) === key);
    if (!r) return;
    setPicked({ id: r.id, label: r.label, instanceRaw: r.instanceRaw, expandable: r.expandable });
    setDagSel(r.id);
    setDagExp(new Set([r.id]));
  };

  const [tree] = createResource(
    () => {
      const p = picked();
      return p
        ? { ...p, book: props.book, chapter: props.chapter, lang: props.lang ?? 'en' }
        : null;
    },
    async (k): Promise<RunTree | null> => {
      const qs = new URLSearchParams({ lang: k.lang });
      if (k.instanceRaw) qs.set('inst', k.instanceRaw);
      const res = await fetch(
        `/api/run-tree/${encodeURIComponent(k.book)}/${k.chapter}/${encodeURIComponent(k.id)}?${qs}`,
      );
      return res.ok ? ((await res.json()) as RunTree) : null;
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
            <RunWaterfall
              rows={rows()}
              totals={r().totals}
              onSelect={onSelect}
              emptyLabel="Nothing cached yet for this chapter."
            />
            <Show when={picked()}>
              {(p) => (
                <div class="inspect-dag">
                  <div class="inspect-dag-head">
                    Build provenance · {p().label}
                    <Show when={!p().expandable}>
                      <span class="comm-muted"> · depends only on sources (no sub-producers)</span>
                    </Show>
                  </div>
                  <RunTreeDag
                    tree={tree() ?? null}
                    loading={tree.loading}
                    selected={dagSel()}
                    onSelect={setDagSel}
                    expanded={dagExp()}
                    onToggleExpand={toggle}
                    emptyLabel="Nothing cached for this piece yet."
                  />
                </div>
              )}
            </Show>
          </>
        )}
      </Show>
    </Drawer>
  );
}
