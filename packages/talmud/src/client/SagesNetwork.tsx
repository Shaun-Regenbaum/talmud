/** Every sage link in one graph, in columns by period. Switch each source of links on or off. */
import { StatusMessage } from '@corpus/ui/Study';
import { createMemo, createResource, createSignal, For, type JSX, Show } from 'solid-js';
import type { NetworkLayer, SageNetwork } from '../lib/sage-graph/network';
import { eraOf } from '../lib/sage-graph/overview';
import { lang, t } from './i18n';
import { shortGenLabel } from './sageArcLayout';
import { HEADER, layoutTimeline } from './sageNetworkLayout';
import { placeLabels } from './sageOverviewLayout';

const LAYERS: NetworkLayer[] = ['checked', 'curated', 'learned'];

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
  const [on, setOn] = createSignal<Record<NetworkLayer, boolean>>({
    checked: true,
    curated: true,
    // These links come from AI reading, not from a check, so they start switched off.
    learned: false,
  });
  const [focus, setFocus] = createSignal<number | null>(null);
  const number = (n: number) => n.toLocaleString(lang() === 'he' ? 'he-IL' : 'en-US');
  const edges = createMemo(() => props.network.edges.filter((e) => on()[e[2]]));
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
  const toggle = (layer: NetworkLayer) => setOn({ ...on(), [layer]: !on()[layer] });
  const s = () => props.network.stats;
  return (
    <figure class="sages-graph sages-network">
      <figcaption>
        {t('sages.network.caption', {
          people: number(shown().length),
          links: number(edges().length),
          noEra: number(s().registryNoEra),
          registry: number(s().registryPeople),
        })}
      </figcaption>
      <fieldset class="sages-layers">
        <legend>{t('sages.network.layers')}</legend>
        <For each={LAYERS}>
          {(layer) => (
            <label>
              <input type="checkbox" checked={on()[layer]} onChange={() => toggle(layer)} />
              <i class={`key-edge layer-${layer}`} />
              {t(`sages.network.layer.${layer}`, { count: number(s().edgesByLayer[layer]) })}
            </label>
          )}
        </For>
      </fieldset>
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
      <p class="sages-network-note">
        {t('sages.network.note', {
          unplaced: number(s().checkedUnplaced),
          dropped: number(s().dropped),
        })}
      </p>
    </figure>
  );
}
