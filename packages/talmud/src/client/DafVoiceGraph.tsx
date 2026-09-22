/** The daf's speakers use the same graph renderer as its arguments. */
import { GraphView } from '@corpus/ui/GraphView';
import { createMemo, createSignal, type JSX } from 'solid-js';
import type { DafVoiceEdge, DafVoiceNode } from '../lib/typing/dafVoices';
import { KIND_DASH, statementColor, stmtRelKind } from './ArgumentFlowGraph';
import { colorForGeneration, GENERATION_BY_ID } from './generations';
import { graphLabels } from './graphLabels';
import { lang, t } from './i18n';

export default function DafVoiceGraph(props: {
  nodes: DafVoiceNode[];
  edges: DafVoiceEdge[];
}): JSX.Element {
  const [focus, setFocus] = createSignal<string | null>(null);
  const lit = createMemo(() => {
    const selected = focus();
    if (!selected) return null;
    const result = new Set([selected]);
    for (const edge of props.edges) {
      if (edge.from === selected) result.add(edge.to);
      if (edge.to === selected) result.add(edge.from);
    }
    return result;
  });
  return (
    <GraphView
      groups={props.nodes.map((n) => ({
        id: n.name,
        label: lang() === 'he' && n.nameHe ? n.nameHe : n.name,
        role: n.collective
          ? t('dafvoices.collective')
          : n.generation
            ? GENERATION_BY_ID[n.generation as keyof typeof GENERATION_BY_ID]?.label
            : undefined,
        color: n.collective ? '#888' : colorForGeneration(n.generation),
        selected: n.name === focus(),
        dimmed: !!lit() && !lit()!.has(n.name),
        detail: n.sections.join('\n'),
        direction: 'auto',
      }))}
      edges={props.edges.map((e, i) => ({
        id: `voice:${i}`,
        kindLabel: t(`dafvoices.rel.${e.kind}`),
        from: e.from,
        to: e.to,
        label: `${t(`dafvoices.rel.${e.kind}`)}${e.note ? ` · ${e.note}` : ''}`,
        color: statementColor(e.kind),
        dash: e.kind === 'supports' ? undefined : KIND_DASH[stmtRelKind(e.kind)],
      }))}
      labels={{ ...graphLabels(), title: t('arggraph.network') }}
      direction={lang() === 'he' ? 'rtl' : 'ltr'}
      onSelect={(n) => setFocus((prev) => (prev === n.id ? null : n.id))}
    />
  );
}
