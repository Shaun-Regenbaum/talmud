/**
 * #argument — opens the passage map for the daf in the URL.
 * The page itself is empty: it reads the saved sections (never generates),
 * hands them to the same passage map the reader opens from the overview, and
 * returns to the daf when the map is closed.
 *   - GET /api/statement-spine supplies sections, statements and the cached AI flow;
 *   - GET /api/derived-flow supplies the deterministic cross-section edges,
 *     merged UNDER the AI flow via mergeFlows (AI keeps final say).
 */
import { createMemo, createResource, createSignal, type JSX, Show } from 'solid-js';
import { mergeFlows } from '../lib/typing/flowMerge';
import type { StatementSpine as StatementSpineData } from '../lib/typing/statementSpine';
import ArgumentFlowGraph, {
  type FlowConnection,
  KIND_COLOR,
  stmtRelKind,
} from './ArgumentFlowGraph';
import { lang, t } from './i18n';

interface DafRef {
  tractate: string;
  page: string;
}

function readRef(): DafRef {
  const p = new URLSearchParams(window.location.search);
  return { tractate: p.get('tractate') ?? 'Berakhot', page: p.get('page') ?? '2a' };
}

interface SpineSection {
  index: number;
  title: string;
  spine: StatementSpineData;
}
interface SpinesResp {
  sections: SpineSection[];
  flow: { from: number; to: number; kind: string }[];
}

async function fetchSpines(tractate: string, page: string, language: string): Promise<SpinesResp> {
  try {
    const r = await fetch(
      `/api/statement-spine/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}?lang=${language}`,
    );
    if (!r.ok) return { sections: [], flow: [] };
    const j = (await r.json()) as Partial<SpinesResp>;
    return {
      sections: Array.isArray(j.sections) ? j.sections : [],
      flow: Array.isArray(j.flow) ? j.flow : [],
    };
  } catch {
    return { sections: [], flow: [] };
  }
}

interface DerivedFlowEdge {
  fromSection: number;
  toSection: number;
  relation: string;
}
async function fetchDerived(tractate: string, page: string): Promise<DerivedFlowEdge[]> {
  try {
    const r = await fetch(
      `/api/derived-flow/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}`,
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { derived?: DerivedFlowEdge[] };
    return Array.isArray(j.derived) ? j.derived : [];
  } catch {
    return [];
  }
}

export function ArgumentGraphPage(): JSX.Element {
  const [ref, setRef] = createSignal<DafRef>(readRef());
  const sync = () => setRef(readRef());
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);

  const [spines] = createResource(
    () => `${ref().tractate}:${ref().page}:${lang()}`,
    () => fetchSpines(ref().tractate, ref().page, lang()),
  );
  const [derived] = createResource(
    () => `${ref().tractate}:${ref().page}`,
    () => fetchDerived(ref().tractate, ref().page),
  );

  const sections = (): SpineSection[] => spines()?.sections ?? [];

  const connections = createMemo<FlowConnection[]>(() => {
    const n = sections().length;
    const valid = (e: { from: number; to: number }) =>
      Number.isInteger(e.from) &&
      Number.isInteger(e.to) &&
      e.from !== e.to &&
      e.from >= 0 &&
      e.from < n &&
      e.to >= 0 &&
      e.to < n;
    const ai: FlowConnection[] = (spines()?.flow ?? []).filter(valid).map((e) => ({
      from: e.from,
      to: e.to,
      kind: (e.kind in KIND_COLOR ? e.kind : 'continues') as FlowConnection['kind'],
    }));
    const det: FlowConnection[] = (derived() ?? [])
      .map((d) => ({
        from: d.fromSection,
        to: d.toSection,
        kind: stmtRelKind(d.relation),
        derived: true,
      }))
      .filter(valid);
    return mergeFlows(ai, det);
  });

  const [activeSection, setActiveSection] = createSignal(0);
  const [selectedStatement, setSelectedStatement] = createSignal<string | null>(null);
  const backHref = () =>
    `?tractate=${encodeURIComponent(ref().tractate)}&page=${encodeURIComponent(ref().page)}#daf`;

  return (
    <Show
      when={!spines.loading}
      fallback={
        <main class="page-shell">
          <p style={{ color: '#888' }}>{t('arggraph.loading')}</p>
        </main>
      }
    >
      <Show
        when={sections().length > 0}
        fallback={
          <main class="page-shell" style={{ '--page-max': '940px' }}>
            <p>{t('arggraph.empty')}</p>
            <a href={backHref()}>{t('arggraph.openDaf')} →</a>
          </main>
        }
      >
        <ArgumentFlowGraph
          initialFullscreen
          controlsOnly
          onFullscreenClose={() => {
            window.location.hash = 'daf';
          }}
          passage={ref()}
          nodes={sections().map((sec) => ({
            index: sec.index,
            title: sec.title,
            statements: sec.spine.nodes,
            statementLinks: sec.spine.links,
          }))}
          connections={connections()}
          activeIndex={activeSection()}
          onSelect={(index) => {
            setActiveSection(index);
            setSelectedStatement(null);
          }}
          selectedStatementId={selectedStatement()}
          onSelectStatement={setSelectedStatement}
        />
      </Show>
    </Show>
  );
}
