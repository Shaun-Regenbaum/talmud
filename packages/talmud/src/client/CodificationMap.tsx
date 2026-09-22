/** Halachic sources share the argument map's connectors and full-screen view. */
import { GraphLegend, GraphView } from '@corpus/ui/GraphView';
import { createSignal, type JSX, Show } from 'solid-js';
import {
  type CodeMapEdge,
  type CodeMapNode,
  type RelationKind,
  relationStyle,
  SIDE_COLOR,
} from './flow/codeMapLayout';
import { graphLabels } from './graphLabels';
import { lang, t } from './i18n';

export type { CodeMapEdge, CodeMapNode } from './flow/codeMapLayout';

export default function CodificationMap(props: {
  nodes: CodeMapNode[];
  edges?: CodeMapEdge[];
  legend?: RelationKind[];
}): JSX.Element {
  const [selected, setSelected] = createSignal<string | null>(null);
  const active = () => props.nodes.find((n) => n.id === selected());
  const name = (n: CodeMapNode) => (n.labelKey ? t(n.labelKey) : n.label);
  const practice = (n: CodeMapNode) =>
    lang() === 'he' ? n.practice?.he || n.practice?.en : n.practice?.en;
  return (
    <>
      <GraphView
        groups={props.nodes.map((n) => ({
          id: n.id,
          label: [name(n), n.ref].filter(Boolean).join(' · '),
          role: n.eraKey ? t(n.eraKey) : n.era,
          color: SIDE_COLOR[n.side],
          badge: n.side === 'a' || n.side === 'b' ? n.side.toUpperCase() : undefined,
          badgeColor: SIDE_COLOR[n.side],
          selected: n.id === selected(),
          detail: [n.ruling, practice(n)].filter(Boolean).join('\n'),
          description: n.ruling,
          annotation: practice(n),
          direction: 'auto',
        }))}
        edges={(props.edges ?? []).map((e, i) => ({
          id: `code:${i}`,
          from: e.from,
          to: e.to,
          label: t(`graph.relation.${e.kind}`),
          color: relationStyle(e.kind).color,
          dash: relationStyle(e.kind).dash,
        }))}
        labels={graphLabels()}
        direction={lang() === 'he' ? 'rtl' : 'ltr'}
        onSelect={(n) => setSelected(n.id)}
      />
      <Show when={active()}>
        {(n) => (
          <div style={{ 'font-size': '.85rem', padding: '.5rem 0' }}>
            <strong>
              {name(n())} · {n().ref}
            </strong>
            <Show when={n().ruling}>
              <p>{n().ruling}</p>
            </Show>
            <Show when={practice(n())}>
              <p>{practice(n())}</p>
            </Show>
          </div>
        )}
      </Show>
      <GraphLegend
        items={(
          props.legend ?? [
            ...new Set<RelationKind>(['transmits', ...(props.edges ?? []).map((e) => e.kind)]),
          ]
        ).map((kind) => ({ label: t(`graph.relation.${kind}`), ...relationStyle(kind) }))}
      />
    </>
  );
}
