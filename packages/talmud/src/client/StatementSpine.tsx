/** The section drill-down uses the shared graph and preserves text-range selection. */
import { GraphView } from '@corpus/ui/GraphView';
import { createSignal, For, type JSX, Show } from 'solid-js';
import type { StatementSpine as Spine } from '../lib/typing/statementSpine';
import { statementGraphEdges, statementGraphNode } from './ArgumentFlowGraph';
import { graphLabels } from './graphLabels';
import { lang, t } from './i18n';

export {
  statementRoleColor as roleColor,
  statementSideColor as sideTint,
} from './ArgumentFlowGraph';

export function StatementSpine(props: {
  spine: Spine;
  title?: string;
  onHighlight?: (
    range: { start: number; end: number; tokenStart?: number; tokenEnd?: number } | null,
  ) => void;
  onPushRabbi?: (name: string) => void;
}): JSX.Element {
  const [selected, setSelected] = createSignal<string | null>(null);
  const active = () => props.spine.nodes.find((n) => n.id === selected());
  return (
    <>
      <GraphView
        groups={[
          {
            id: 'section',
            label: props.title || t('arggraph.title'),
            expanded: true,
            children: props.spine.nodes.map((s) => ({
              ...statementGraphNode(s),
              selected: s.id === selected(),
            })),
          },
        ]}
        edges={statementGraphEdges(props.spine.links)}
        labels={graphLabels()}
        direction={lang() === 'he' ? 'rtl' : 'ltr'}
        onSelect={(n) => {
          const s = props.spine.nodes.find((s) => s.id === n.id);
          if (!s) return;
          setSelected(s.id);
          props.onHighlight?.({
            start: s.startSegIdx,
            end: s.endSegIdx,
            tokenStart: s.tokenStart,
            tokenEnd: s.tokenEnd,
          });
        }}
      />
      <Show when={active()}>
        {(s) => (
          <div style={{ padding: '0.5rem 0', 'font-size': '0.85rem' }}>
            <For each={s().rabbiNames}>
              {(name) => (
                <button
                  type="button"
                  onClick={() => props.onPushRabbi?.(name)}
                  disabled={!props.onPushRabbi}
                  style={{ 'margin-inline-end': '.4rem' }}
                >
                  {name}
                </button>
              )}
            </For>
            <Show when={s().summary}>
              <p dir="auto">{s().summary}</p>
            </Show>
            <Show when={s().excerpt}>
              <p dir="rtl" lang="he">
                {s().excerpt}
              </p>
            </Show>
          </div>
        )}
      </Show>
      <Show when={!props.spine.nodes.length}>
        <p>{t('arggraph.section.none')}</p>
      </Show>
    </>
  );
}
