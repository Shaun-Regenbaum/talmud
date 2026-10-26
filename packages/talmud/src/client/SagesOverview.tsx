/** The sage network as a whole, and what is still open. Shown before anyone picks a sage. */
import { StatusMessage } from '@corpus/ui/Study';
import { createMemo, createResource, createSignal, For, type JSX, Show } from 'solid-js';
import {
  eraOf,
  type OverviewEdge,
  type OverviewNode,
  type SageOverview,
} from '../lib/sage-graph/overview';
import { lang, t } from './i18n';
import { layoutOverview, placeLabels } from './sageOverviewLayout';

const WIDTH = 960;
// An edge the passage only reports is dashed. One it shows happening is solid.
const SHOWN = new Set(['occurred', 'established']);

async function load(): Promise<SageOverview | null> {
  try {
    const response = await fetch('/api/sage-graph/overview');
    return response.ok ? ((await response.json()) as SageOverview) : null;
  } catch {
    return null;
  }
}

export function SagesOverview(): JSX.Element {
  const [data, { refetch }] = createResource(load);
  return (
    <section class="sages-overview" aria-labelledby="sages-overview-title">
      <h2 id="sages-overview-title">{t('sages.overview.title')}</h2>
      <p class="sages-overview-lead">{t('sages.overview.lead')}</p>
      <Show when={data.loading}>
        <div class="sages-skeleton" role="status" aria-live="polite">
          <p class="sages-skeleton-text">
            <span class="sages-spinner" aria-hidden="true" /> {t('sages.overview.loading')}
          </p>
          <div class="sages-skeleton-graph" aria-hidden="true" />
          <div class="sages-skeleton-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
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
      <Show when={data()}>{(overview) => <Loaded overview={overview()} />}</Show>
    </section>
  );
}

function Loaded(props: { overview: SageOverview }): JSX.Element {
  const number = (n: number) => n.toLocaleString(lang() === 'he' ? 'he-IL' : 'en-US');
  const s = () => props.overview.stats;
  const date = () => props.overview.createdAt.slice(0, 10);
  return (
    <>
      <NetworkGraph overview={props.overview} number={number} />
      <h3>{t('sages.overview.openTitle')}</h3>
      <ul class="sages-open">
        <Open
          n={number(s().proposalsWaiting)}
          text={t('sages.overview.open.proposals')}
          href="#initial-readings"
          link={t('sages.overview.open.proposalsLink')}
        />
        <Open
          n={number(s().identitiesAccepted)}
          text={t('sages.overview.open.accepted', {
            uncertain: number(s().assignmentsUncertain),
            supported: number(s().assignmentsSupported),
          })}
        />
        <Open
          n={number(s().nodes - s().nodesNamed)}
          text={t('sages.overview.open.local', {
            total: number(s().nodes),
            named: number(s().nodesNamed),
          })}
        />
        <Open
          n={number(s().nodes - s().nodesWithEra)}
          text={t('sages.overview.open.noEra', { total: number(s().nodes) })}
        />
        <Open
          n={number(s().passagesWithConnections)}
          text={t('sages.overview.open.coverage', {
            passages: number(s().passages),
            works: number(s().worksWithConnections),
          })}
        />
        <Open
          n={number(s().connectionsStatedOnly)}
          text={t('sages.overview.open.stated', { total: number(s().connections) })}
        />
        <Open
          n={number(s().nameMentionsPending + s().withheld)}
          text={t('sages.overview.open.held', {
            pending: number(s().nameMentionsPending),
            withheld: number(s().withheld),
          })}
        />
      </ul>
      <Show when={props.overview.works.length}>
        <h3>{t('sages.overview.worksTitle')}</h3>
        <ul class="sages-works">
          <For each={props.overview.works.slice(0, 10)}>
            {(w) => (
              <li>
                <span class="sages-works-name">{w.work}</span>
                <span
                  class="sages-works-bar"
                  style={{
                    width: `${Math.max(4, (w.connections / props.overview.works[0].connections) * 100)}%`,
                  }}
                />
                <span class="sages-works-n">{number(w.connections)}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <p class="sages-overview-foot">
        {t('sages.overview.foot', { date: date() })} <bdi>{props.overview.change}</bdi>
      </p>
    </>
  );
}

function Open(props: { n: string; text: string; href?: string; link?: string }): JSX.Element {
  return (
    <li>
      <span class="sages-open-n">{props.n}</span>
      <span>
        {props.text}
        <Show when={props.href}>
          {' '}
          <a href={props.href}>{props.link}</a>
        </Show>
      </span>
    </li>
  );
}

/** A name seen in one passage can be a whole phrase. The tooltip keeps the full text. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function NetworkGraph(props: {
  overview: SageOverview;
  number: (n: number) => string;
}): JSX.Element {
  const [hovered, setHovered] = createSignal<string | null>(null);
  const layout = createMemo(() =>
    layoutOverview(props.overview.nodes, props.overview.edges, WIDTH),
  );
  const degree = createMemo(() => {
    const d = new Map<string, number>();
    for (const e of props.overview.edges) {
      d.set(e.a, (d.get(e.a) ?? 0) + 1);
      d.set(e.b, (d.get(e.b) ?? 0) + 1);
    }
    return d;
  });
  const neighbours = createMemo(() => {
    const id = hovered();
    const out = new Set<string>();
    if (!id) return out;
    out.add(id);
    for (const e of props.overview.edges) {
      if (e.a === id) out.add(e.b);
      if (e.b === id) out.add(e.a);
    }
    return out;
  });
  const name = (n: OverviewNode) => (lang() === 'he' && n.labelHe ? n.labelHe : n.label);
  // A drawn label has little room, so the bracketed part of a long name is left to the tooltip.
  const shortName = (n: OverviewNode) => name(n).replace(/\s*\[[^\]]*\]/, '');
  const byId = createMemo(() => new Map(props.overview.nodes.map((n) => [n.id, n])));
  const radius = (id: string) => 4.5 + Math.min(6, (degree().get(id) ?? 1) * 0.8);
  const compactIds = createMemo(
    () =>
      new Set(
        layout()
          .boxes.filter((b) => b.compact)
          .flatMap((b) => b.ids),
      ),
  );
  // Small groups write every name under its dot. In the big groups only the labels that fit are drawn.
  const labels = createMemo(() => {
    const big = props.overview.nodes
      .filter((n) => !compactIds().has(n.id) && n.named && (degree().get(n.id) ?? 0) >= 2)
      .map((n) => {
        const p = layout().positions.get(n.id) as { x: number; y: number };
        const text = shortName(n);
        const half = (text.length * 6) / 2 + 3;
        return {
          id: n.id,
          // A label near the edge slides inward so it is never cut off.
          x: Math.min(WIDTH - half, Math.max(half, p.x)),
          y: p.y - radius(n.id) - 4,
          text,
          priority: degree().get(n.id) ?? 0,
        };
      });
    return placeLabels(big);
  });
  const labelX = (n: OverviewNode) => {
    const x = (layout().positions.get(n.id) as { x: number }).x;
    const half = (shortName(n).length * 6) / 2 + 3;
    return Math.min(WIDTH - half, Math.max(half, x));
  };
  const edgeTitle = (e: OverviewEdge) =>
    `${name(byId().get(e.a) as OverviewNode)} – ${name(byId().get(e.b) as OverviewNode)} · ${e.ref}`;
  const inSmall = (id: string) => compactIds().has(id);
  const partBoxes = (part: 'main' | 'small') =>
    layout().boxes.filter((b) => b.compact === (part === 'small'));
  const partEdges = (part: 'main' | 'small') =>
    props.overview.edges.filter((e) => inSmall(e.a) === (part === 'small'));
  const partNodes = (part: 'main' | 'small') =>
    props.overview.nodes.filter((n) => inSmall(n.id) === (part === 'small'));
  // The two parts share one coordinate system. Each shows only its own band of it.
  const viewBox = (part: 'main' | 'small') => {
    const boxes = partBoxes(part);
    if (!boxes.length) return `0 0 ${WIDTH} 80`;
    const top = Math.min(...boxes.map((b) => b.y));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    return `0 ${top} ${WIDTH} ${Math.max(bottom - top, 80)}`;
  };
  const smallCount = () => layout().boxes.filter((b) => b.compact).length;
  const graph = (part: 'main' | 'small') => (
    <div class="sages-graph-scroll">
      <svg
        viewBox={viewBox(part)}
        role="img"
        aria-label={t('sages.overview.graphLabel')}
        classList={{ 'has-hover': hovered() !== null }}
      >
        <For each={partBoxes(part)}>
          {(b) => (
            <rect
              class="sages-graph-box"
              classList={{ 'is-compact': b.compact }}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx="8"
            />
          )}
        </For>
        <For each={partEdges(part)}>
          {(e) => {
            const a = () => layout().positions.get(e.a);
            const b = () => layout().positions.get(e.b);
            return (
              <Show when={a() && b()}>
                <line
                  class="sages-graph-edge"
                  classList={{
                    'is-shown': SHOWN.has(e.outcome),
                    'is-active': hovered() !== null && (e.a === hovered() || e.b === hovered()),
                  }}
                  x1={a()?.x}
                  y1={a()?.y}
                  x2={b()?.x}
                  y2={b()?.y}
                >
                  <title>{edgeTitle(e)}</title>
                </line>
              </Show>
            );
          }}
        </For>
        <For each={partNodes(part)}>
          {(n) => {
            const p = () => layout().positions.get(n.id) as { x: number; y: number };
            const open = () => {
              location.hash = `sages/${encodeURIComponent(n.id)}`;
            };
            const compact = () => compactIds().has(n.id);
            const shape = () => (
              <>
                <circle
                  class={`sages-graph-node era-${eraOf(n.generation)}`}
                  classList={{ 'is-named': n.named }}
                  cx={p().x}
                  cy={p().y}
                  r={radius(n.id)}
                >
                  <title>{name(n)}</title>
                </circle>
                <Show when={compact()}>
                  <text
                    class="sages-graph-label is-below"
                    x={p().x}
                    y={p().y + radius(n.id) + 14}
                    text-anchor="middle"
                  >
                    {clip(shortName(n), 14)}
                  </text>
                </Show>
                <Show when={!compact() && labels().has(n.id)}>
                  <text
                    class="sages-graph-label"
                    x={labelX(n)}
                    y={p().y - radius(n.id) - 4}
                    text-anchor="middle"
                  >
                    {shortName(n)}
                  </text>
                </Show>
              </>
            );
            const dim = () => hovered() !== null && !neighbours().has(n.id);
            return (
              <Show
                when={n.named}
                fallback={
                  <g
                    classList={{ 'is-dim': dim() }}
                    onPointerEnter={() => setHovered(n.id)}
                    onPointerLeave={() => setHovered(null)}
                  >
                    {shape()}
                  </g>
                }
              >
                {/* biome-ignore lint/a11y/useSemanticElements: an <a> inside this SVG did not draw when tried */}
                <g
                  class="sages-graph-person"
                  classList={{ 'is-dim': dim() }}
                  role="link"
                  tabindex={0}
                  aria-label={name(n)}
                  onClick={open}
                  onPointerEnter={() => setHovered(n.id)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(n.id)}
                  onBlur={() => setHovered(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      open();
                    }
                  }}
                >
                  {shape()}
                </g>
              </Show>
            );
          }}
        </For>
      </svg>
    </div>
  );
  return (
    <figure class="sages-graph">
      <figcaption>
        {t('sages.overview.graphCaption', {
          connections: props.number(props.overview.stats.connections),
          names: props.number(props.overview.nodes.length),
          groups: props.number(props.overview.stats.components),
        })}
      </figcaption>
      {graph('main')}
      <Show when={smallCount() > 0}>
        <details class="sages-small-groups">
          <summary>
            {t('sages.overview.smallGroups', { count: props.number(smallCount()) })}
          </summary>
          {graph('small')}
        </details>
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
        <li>
          <i class="key-node era-unknown is-named" /> {t('sages.overview.key.noEra')}
        </li>
        <li>
          <i class="key-node" /> {t('sages.overview.key.local')}
        </li>
        <li>
          <i class="key-edge is-shown" /> {t('sages.overview.key.shown')}
        </li>
        <li>
          <i class="key-edge" /> {t('sages.overview.key.stated')}
        </li>
      </ul>
    </figure>
  );
}
