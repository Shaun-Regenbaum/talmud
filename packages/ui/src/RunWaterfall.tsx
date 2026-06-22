/**
 * @corpus/ui — RunWaterfall.
 *
 * The build-provenance WATERFALL: every piece run for a unit (daf / chapter),
 * ranked by cold-build time, each row a labelled bar + cost — the same view the
 * Talmud reader's Inspect dock shows, on the shared run-tree primitives so both
 * apps read identically. The app feeds rows (from /api/daf-runs or
 * /api/chapter-runs); this just renders. Styling: `.runwf-*` in inspector.css.
 */

import { For, type JSX, Show } from 'solid-js';
import { fmtCost, fmtMs, type IconVariant, NodeIcon } from './RunTree.tsx';

export interface WaterfallRow {
  id: string;
  label: string;
  /** Per-instance discriminator (verse / range) or null for a whole-unit piece. */
  instance?: string | null;
  cached: boolean;
  coldMs: number | null;
  cost: number | null;
  tokens?: number | null;
  /** Icon kind; defaults to 'enrichment'. */
  variant?: IconVariant;
}

export interface RunWaterfallProps {
  rows: WaterfallRow[];
  totals?: { count: number; cached: number; cost: number; coldMs: number };
  /** Click a row (e.g. to open its DAG). Rows become buttons when provided. */
  onSelect?: (id: string) => void;
  emptyLabel?: string;
}

const ICON_COLOR: Record<IconVariant, string> = {
  source: '#6b7280',
  mark: '#1d4ed8',
  enrichment: '#7c3aed',
  computed: '#0891b2',
};

export function RunWaterfall(props: RunWaterfallProps): JSX.Element {
  // Ranked by cold-build time (the expensive pieces float up); a warm reload is
  // all near-zero, a cold load shows the real shape.
  const sorted = () => [...props.rows].sort((a, b) => (b.coldMs ?? 0) - (a.coldMs ?? 0));
  const maxCold = () => Math.max(1, ...props.rows.map((r) => r.coldMs ?? 0));

  return (
    <div class="runwf">
      <Show when={props.totals}>
        {(t) => (
          <div class="inspect-totals">
            {t().cached}/{t().count} cached · {fmtCost(t().cost)} · {fmtMs(t().coldMs)}
          </div>
        )}
      </Show>
      <For
        each={sorted()}
        fallback={<p class="comm-muted">{props.emptyLabel ?? 'Nothing cached yet.'}</p>}
      >
        {(r) => {
          const variant = r.variant ?? 'enrichment';
          const pct = r.coldMs ? Math.max(2, Math.round((r.coldMs / maxCold()) * 100)) : 0;
          const clickable = !!props.onSelect;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: a waterfall row can't be a real <button> (it's a flex bar layout); role=button + tabindex + keydown make it keyboard-operable
            <div
              class="runwf-row"
              classList={{ clickable }}
              role={clickable ? 'button' : undefined}
              tabindex={clickable ? 0 : undefined}
              title={clickable ? `Inspect ${r.label}` : undefined}
              onClick={() => props.onSelect?.(r.id)}
              onKeyDown={(e) => {
                if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  props.onSelect?.(r.id);
                }
              }}
            >
              <span
                class="inspect-dot"
                classList={{ hit: r.cached }}
                title={r.cached ? 'cached' : 'not cached'}
              />
              <span class="runwf-icon">
                <NodeIcon variant={variant} color={ICON_COLOR[variant]} />
              </span>
              <span class="runwf-label">
                {r.label}
                <Show when={r.instance}>{(i) => <span class="inspect-inst"> · {i()}</span>}</Show>
              </span>
              <span class="runwf-bar">
                <Show when={pct > 0}>
                  <span class="runwf-fill" style={{ width: `${pct}%` }} />
                </Show>
              </span>
              <span class="runwf-meta">
                <Show when={r.cached} fallback={<span class="inspect-miss">miss</span>}>
                  <Show when={r.coldMs}>
                    {(ms) => <span class="inspect-ms">{fmtMs(ms())}</span>}
                  </Show>
                  <Show when={r.cost != null}>
                    <span class="inspect-cost">{fmtCost(r.cost)}</span>
                  </Show>
                </Show>
              </span>
            </div>
          );
        }}
      </For>
    </div>
  );
}
