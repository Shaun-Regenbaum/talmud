/** Every sage link in one graph: round a circle by default, or in columns by period. */
import { StatusMessage } from '@corpus/ui/Study';
import { createMemo, createResource, createSignal, For, type JSX, Show } from 'solid-js';
import type { NetworkLayer, SageNetwork } from '../lib/sage-graph/network';
import { eraOf } from '../lib/sage-graph/overview';
import { lang, t } from './i18n';
import { shortGenLabel } from './sageArcLayout';
import { bundledPath, layoutCircle } from './sageCircleLayout';
import { HEADER, layoutTimeline } from './sageNetworkLayout';
import { placeLabels } from './sageOverviewLayout';

// These links come from AI reading and are not checked, so the page does not draw them.
const SHOWN_LAYERS = new Set<NetworkLayer>(['checked', 'crosschecked', 'curated']);
const RING = 400;
const SIDE = 190;
const TOP_NAMES = 18;

type Pt = { x: number; y: number };

/** A gentle curve, bowed to one side or the other, so links that start and end at the same height
 * do not lie on top of each other. */
function curve(a: Pt, b: Pt, seed: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const bow = (seed % 2 ? 1 : -1) * length * 0.22;
  const cx = (a.x + b.x) / 2 + (-dy / length) * bow;
  const cy = (a.y + b.y) / 2 + (dx / length) * bow;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

async function load(): Promise<SageNetwork | null> {
  try {
    const response = await fetch('/api/sage-graph/network');
    return response.ok ? ((await response.json()) as SageNetwork) : null;
  } catch {
    return null;
  }
}

export function SagesNetwork(): JSX.Element {
  const [data, { refetch }] = createResource(load);
  return (
    <>
      <Show when={data.loading}>
        <div class="sages-skeleton" role="status" aria-live="polite">
          <p class="sages-skeleton-text">
            <span class="sages-spinner" aria-hidden="true" /> {t('sages.overview.loading')}
          </p>
          <div class="sages-skeleton-graph" aria-hidden="true" />
        </div>
      </Show>
      <Show when={!data.loading && !data()}>
        <StatusMessage
          tone="error"
          onRetry={() => void refetch()}
          retryLabel={t('sages.connections.retry')}
        >
          {t('sages.overview.error')}
        </StatusMessage>
      </Show>
      <Show when={data()}>{(network) => <Graph network={network()} />}</Show>
    </>
  );
}

function Graph(props: { network: SageNetwork }): JSX.Element {
  const [view, setView] = createSignal<'circle' | 'period'>('circle');
  const [focus, setFocus] = createSignal<number | null>(null);
  const number = (n: number) => n.toLocaleString(lang() === 'he' ? 'he-IL' : 'en-US');
  const edges = createMemo(() => props.network.edges.filter((e) => SHOWN_LAYERS.has(e[2])));
  const degree = createMemo(() => {
    const d = new Map<number, number>();
    for (const e of edges()) {
      d.set(e[0], (d.get(e[0]) ?? 0) + 1);
      d.set(e[1], (d.get(e[1]) ?? 0) + 1);
    }
    return d;
  });
  const shown = createMemo(() =>
    props.network.nodes.flatMap((n, i) =>
      degree().has(i) ? [{ i, n, degree: degree().get(i) as number }] : [],
    ),
  );
  const layout = createMemo(() =>
    layoutTimeline(
      shown().map((s) => ({ id: String(s.i), generation: s.n.generation, degree: s.degree })),
    ),
  );
  const near = createMemo(() => {
    const f = focus();
    const out = new Set<number>();
    if (f === null) return out;
    out.add(f);
    for (const e of edges()) {
      if (e[0] === f) out.add(e[1]);
      if (e[1] === f) out.add(e[0]);
    }
    return out;
  });
  const focusLabels = createMemo(() => {
    const f = focus();
    if (f === null) return [] as { i: number; x: number; y: number; text: string }[];
    const all = [...near()].flatMap((i) => {
      const p = layout().positions.get(String(i));
      if (!p) return [];
      const text = nameOf(i);
      return [
        {
          id: String(i),
          x: p.x,
          y: p.y - 7,
          text,
          priority: i === f ? 1e9 : (degree().get(i) ?? 0),
        },
      ];
    });
    const keep = placeLabels(all);
    return all
      .filter((l) => keep.has(l.id))
      .map((l) => ({ i: Number(l.id), x: l.x, y: l.y, text: l.text }));
  });
  const name = (i: number) => nameOf(i);
  const nameOf = (i: number) => {
    const n = props.network.nodes[i];
    return lang() === 'he' && n.nameHe ? n.nameHe : n.name;
  };
  const at = (i: number) => layout().positions.get(String(i));
  const open = (i: number) => {
    location.hash = `sages/${encodeURIComponent(props.network.nodes[i].id)}`;
  };
  const ring = createMemo(() =>
    layoutCircle(
      shown().map((x) => ({ id: String(x.i), generation: x.n.generation, degree: x.degree })),
      edges().map((e) => [String(e[0]), String(e[1])] as [string, string]),
      RING,
    ),
  );
  const ringAt = (i: number) => ring().positions.get(String(i));
  // Names sit just outside the ring, on the side of the circle they are on.
  const ringLabels = createMemo(() => {
    const f = focus();
    const wanted =
      f === null
        ? [...shown()].sort((x, y) => y.degree - x.degree || x.i - y.i).slice(0, TOP_NAMES)
        : shown().filter((x) => near().has(x.i));
    const all = wanted.flatMap((x) => {
      const p = ringAt(x.i);
      if (!p) return [];
      const text = nameOf(x.i);
      const right = Math.cos(p.angle) >= 0;
      const width = text.length * 8.6;
      const x0 = p.x + Math.cos(p.angle) * 12;
      return [
        {
          id: String(x.i),
          x: right ? x0 + width / 2 : x0 - width / 2,
          y: p.y + Math.sin(p.angle) * 12 + 4,
          text,
          right,
          x0,
          priority: x.i === f ? 1e9 : x.degree,
        },
      ];
    });
    const keep = placeLabels(all);
    return all.filter((l) => keep.has(l.id));
  });
  return (
    <figure class="sages-graph sages-network">
      <div class="sages-network-bar">
        <p class="sages-network-caption">
          {t('sages.network.captionShort', {
            people: number(shown().length),
            links: number(edges().length),
          })}
        </p>
        <fieldset class="sages-view" aria-label={t('sages.network.view')}>
          <button
            type="button"
            aria-pressed={view() === 'circle'}
            onClick={() => setView('circle')}
          >
            {t('sages.network.view.circle')}
          </button>
          <button
            type="button"
            aria-pressed={view() === 'period'}
            onClick={() => setView('period')}
          >
            {t('sages.network.view.period')}
          </button>
        </fieldset>
      </div>
      <Show when={view() === 'circle'}>
        <div class="sages-graph-scroll">
          <svg
            viewBox={`${-(RING + SIDE)} ${-(RING + 40)} ${2 * (RING + SIDE)} ${2 * (RING + 40)}`}
            role="img"
            aria-label={t('sages.network.label')}
            classList={{ 'has-hover': focus() !== null }}
          >
            <For each={edges()}>
              {(e) => {
                const a = () => ringAt(e[0]);
                const b = () => ringAt(e[1]);
                return (
                  <Show when={a() && b()}>
                    <path
                      class={`sages-link layer-${e[2]}`}
                      classList={{
                        'is-active': focus() !== null && (e[0] === focus() || e[1] === focus()),
                      }}
                      d={bundledPath(a() as Pt, b() as Pt)}
                    />
                  </Show>
                );
              }}
            </For>
            <For each={shown()}>
              {(item) => {
                const p = () => ringAt(item.i);
                return (
                  <Show when={p()}>
                    {/* biome-ignore lint/a11y/useSemanticElements: an <a> inside this SVG did not draw when tried */}
                    <circle
                      class={`sages-graph-node is-named era-${eraOf(item.n.generation)}`}
                      classList={{ 'is-dim': focus() !== null && !near().has(item.i) }}
                      cx={p()?.x}
                      cy={p()?.y}
                      r={3 + Math.min(5, item.degree * 0.22)}
                      role="link"
                      tabindex={0}
                      aria-label={name(item.i)}
                      onClick={() => open(item.i)}
                      onPointerEnter={() => setFocus(item.i)}
                      onPointerLeave={() => setFocus(null)}
                      onFocus={() => setFocus(item.i)}
                      onBlur={() => setFocus(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          open(item.i);
                        }
                      }}
                    >
                      <title>{name(item.i)}</title>
                    </circle>
                  </Show>
                );
              }}
            </For>
            <For each={ringLabels()}>
              {(l) => (
                <text
                  class="sages-graph-label"
                  x={l.x0}
                  y={l.y}
                  text-anchor={l.right ? 'start' : 'end'}
                >
                  {l.text}
                </text>
              )}
            </For>
          </svg>
        </div>
      </Show>
      <Show when={view() === 'period'}>
        <div class="sages-graph-scroll">
          <svg
            viewBox={`0 0 ${Math.max(layout().width, 300)} ${Math.max(layout().height, 80)}`}
            role="img"
            aria-label={t('sages.network.label')}
            classList={{ 'has-hover': focus() !== null }}
          >
            <For each={layout().bands}>
              {(b, k) => (
                <g class="sages-band">
                  <rect
                    x={b.x}
                    y={HEADER - 4}
                    width={b.w}
                    height={layout().height - HEADER + 4}
                    rx="6"
                  />
                  <text x={b.x + b.w / 2} y={k() % 2 ? 26 : 12} text-anchor="middle">
                    {b.gen ? shortGenLabel(b.gen, lang() === 'he') : t('sages.network.noEra')}
                  </text>
                </g>
              )}
            </For>
            <For each={edges()}>
              {(e) => {
                const a = () => at(e[0]);
                const b = () => at(e[1]);
                return (
                  <Show when={a() && b()}>
                    <path
                      class={`sages-link layer-${e[2]}`}
                      classList={{
                        'is-active': focus() !== null && (e[0] === focus() || e[1] === focus()),
                      }}
                      d={curve(a() as Pt, b() as Pt, e[0] + e[1])}
                    />
                  </Show>
                );
              }}
            </For>
            <For each={shown()}>
              {(item) => {
                const p = () => at(item.i);
                return (
                  <Show when={p()}>
                    {/* biome-ignore lint/a11y/useSemanticElements: an <a> inside this SVG did not draw when tried */}
                    <circle
                      class={`sages-graph-node is-named era-${eraOf(item.n.generation)}`}
                      classList={{ 'is-dim': focus() !== null && !near().has(item.i) }}
                      cx={p()?.x}
                      cy={p()?.y}
                      r={3 + Math.min(3.5, item.degree * 0.25)}
                      role="link"
                      tabindex={0}
                      aria-label={name(item.i)}
                      onClick={() => open(item.i)}
                      onPointerEnter={() => setFocus(item.i)}
                      onPointerLeave={() => setFocus(null)}
                      onFocus={() => setFocus(item.i)}
                      onBlur={() => setFocus(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          open(item.i);
                        }
                      }}
                    >
                      <title>{name(item.i)}</title>
                    </circle>
                  </Show>
                );
              }}
            </For>
            <For each={focusLabels()}>
              {(l) => (
                <text class="sages-graph-label" x={l.x} y={l.y} text-anchor="middle">
                  {l.text}
                </text>
              )}
            </For>
          </svg>
        </div>
      </Show>
      <ul class="sages-graph-key">
        <li>
          <i class="key-node era-tanna is-named" /> {t('sages.overview.key.tanna')}
        </li>
        <li>
          <i class="key-node era-amora-ey is-named" /> {t('sages.overview.key.amoraEy')}
        </li>
        <li>
          <i class="key-node era-amora-bavel is-named" /> {t('sages.overview.key.amoraBavel')}
        </li>
      </ul>
    </figure>
  );
}
