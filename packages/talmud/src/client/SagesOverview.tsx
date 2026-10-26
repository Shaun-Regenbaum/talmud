/** The sage network as a whole, and what is still open. Shown before anyone picks a sage. */
import { StatusMessage } from '@corpus/ui/Study';
import { createMemo, createResource, For, type JSX, Show } from 'solid-js';
import type { OverviewEdge, OverviewNode, SageOverview } from '../lib/sage-graph/overview';
import { lang, t } from './i18n';
import { layoutOverview } from './sageOverviewLayout';

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
        <StatusMessage tone="loading">{t('sages.overview.loading')}</StatusMessage>
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

function NetworkGraph(props: {
  overview: SageOverview;
  number: (n: number) => string;
}): JSX.Element {
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
  const name = (n: OverviewNode) => (lang() === 'he' && n.labelHe ? n.labelHe : n.label);
  // A drawn label has little room, so the bracketed part of a long name is left to the tooltip.
  const shortName = (n: OverviewNode) => name(n).replace(/\s*\[[^\]]*\]/, '');
  const byId = createMemo(() => new Map(props.overview.nodes.map((n) => [n.id, n])));
  const edgeTitle = (e: OverviewEdge) =>
    `${name(byId().get(e.a) as OverviewNode)} – ${name(byId().get(e.b) as OverviewNode)} · ${e.ref}`;
  return (
    <figure class="sages-graph">
      <figcaption>
        {t('sages.overview.graphCaption', {
          connections: props.number(props.overview.stats.connections),
          names: props.number(props.overview.nodes.length),
          groups: props.number(props.overview.stats.components),
        })}
      </figcaption>
      <div class="sages-graph-scroll">
        <svg
          viewBox={`0 0 ${WIDTH} ${Math.max(layout().height, 80)}`}
          role="img"
          aria-label={t('sages.overview.graphLabel')}
        >
          <For each={layout().boxes.filter((b) => b.ids.length > 1)}>
            {(b) => (
              <rect class="sages-graph-box" x={b.x} y={b.y} width={b.w} height={b.h} rx="6" />
            )}
          </For>
          <For each={props.overview.edges}>
            {(e) => {
              const a = () => layout().positions.get(e.a);
              const b = () => layout().positions.get(e.b);
              return (
                <Show when={a() && b()}>
                  <line
                    class="sages-graph-edge"
                    classList={{ 'is-shown': SHOWN.has(e.outcome) }}
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
          <For each={props.overview.nodes}>
            {(n) => {
              const p = () => layout().positions.get(n.id) as { x: number; y: number };
              const r = () => 4 + Math.min(6, (degree().get(n.id) ?? 1) * 0.8);
              const open = () => {
                location.hash = `sages/${encodeURIComponent(n.id)}`;
              };
              const shape = () => (
                <>
                  <circle
                    class="sages-graph-node"
                    classList={{ 'is-named': n.named }}
                    cx={p().x}
                    cy={p().y}
                    r={r()}
                  >
                    <title>{name(n)}</title>
                  </circle>
                  <Show when={n.named && (degree().get(n.id) ?? 0) >= 5}>
                    <text
                      class="sages-graph-label"
                      x={p().x}
                      y={p().y - r() - 3}
                      text-anchor="middle"
                    >
                      {shortName(n)}
                    </text>
                  </Show>
                </>
              );
              return (
                <Show when={n.named} fallback={<g>{shape()}</g>}>
                  {/* biome-ignore lint/a11y/useSemanticElements: an <a> inside this SVG did not draw when tried */}
                  <g
                    class="sages-graph-person"
                    role="link"
                    tabindex={0}
                    aria-label={name(n)}
                    onClick={open}
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
      <ul class="sages-graph-key">
        <li>
          <i class="key-node is-named" /> {t('sages.overview.key.named')}
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
