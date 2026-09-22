import {
  type GraphConnection,
  GraphDialog,
  type GraphGroup,
  type GraphViewProps,
} from '@corpus/ui/GraphView';
import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { adjacentAmud, amudToNumber } from '../lib/sefref/amudim';
import { pageLabelHe } from '../lib/sefref/tractates';
import { mergeFlows } from '../lib/typing/flowMerge';
import type { StatementSpine } from '../lib/typing/statementSpine';
import {
  type FlowConnection,
  KIND_COLOR,
  KIND_DASH,
  statementGraphEdges,
  statementGraphNode,
  stmtRelKind,
} from './ArgumentFlowGraph';
import { lang, t } from './i18n';
import type { SpineViewDaf } from './SpineFlowGraph';

interface PageGraph {
  page: string;
  groups: GraphGroup[];
  edges: GraphConnection[];
  movesComputed?: boolean;
}
interface SavedPage {
  movesComputed?: boolean;
  sections: { index: number; title: string; spine: StatementSpine }[];
  flow: FlowConnection[];
}

/** Page-qualified IDs keep repeated section and statement IDs distinct. */
export function qualifyPage(graph: PageGraph): PageGraph {
  const prefix = `${graph.page}/`;
  return {
    page: graph.page,
    movesComputed: graph.movesComputed,
    groups: graph.groups.map((g) => ({
      ...g,
      id: prefix + g.id,
      reference: graph.page,
      children: g.children?.map((n) => ({ ...n, id: prefix + n.id, reference: graph.page })),
      actions: g.actions?.map((n) => ({ ...n, id: prefix + n.id })),
    })),
    edges: graph.edges.map((e) => ({
      ...e,
      id: prefix + e.id,
      from: prefix + e.from,
      to: prefix + e.to,
    })),
  };
}

export function savedPageGraph(
  page: string,
  saved: SavedPage,
  derived: FlowConnection[] = [],
): PageGraph {
  const ids = new Set(saved.sections.map((s) => s.index));
  const flow = mergeFlows(saved.flow ?? [], derived).filter(
    (e) => ids.has(e.from) && ids.has(e.to),
  );
  return {
    page,
    movesComputed: saved.movesComputed,
    groups: saved.sections.map((s) => ({
      id: `section:${s.index}`,
      label: s.title,
      badge: String(s.index + 1),
      expanded: true,
      children: s.spine.nodes.map((n) =>
        statementGraphNode(n, `section:${s.index}:statement:${n.id}`),
      ),
    })),
    edges: [
      ...flow.map((e, i) => ({
        id: `section-edge:${i}`,
        from: `section:${e.from}`,
        to: `section:${e.to}`,
        label: t(`link.rel.${e.kind}`),
        kindLabel: t(`link.rel.${e.kind}`),
        color: KIND_COLOR[e.kind] ?? KIND_COLOR.continues,
        dash: KIND_DASH[e.kind] ?? (e.derived ? '2 3' : undefined),
        provenance: e.derived ? t('graph.source.roles') : undefined,
      })),
      ...saved.sections.flatMap((s) =>
        statementGraphEdges(s.spine.links, `section:${s.index}:statement:`),
      ),
    ],
  };
}

/** Never infer a logical edge from page adjacency. Use saved section endpoints. */
export function passageConnections(
  pages: PageGraph[],
  snapshot: SpineViewDaf[],
): GraphConnection[] {
  const present = new Set(pages.flatMap((p) => p.groups.map((g) => g.id)));
  return snapshot.flatMap((d) =>
    (d.cross ?? []).flatMap((e, i) => {
      const from = `${d.page}/section:${e.fromSection}`,
        to = `${d.nextPage}/section:${e.toSection}`;
      if (!d.nextPage || !present.has(from) || !present.has(to)) return [];
      const kind =
        e.relation in KIND_COLOR ? (e.relation as FlowConnection['kind']) : stmtRelKind(e.relation);
      return [
        {
          id: `cross:${d.page}:${i}`,
          from,
          to,
          label: [t(`link.rel.${kind}`), e.note].filter(Boolean).join(' · '),
          kindLabel: t(`link.rel.${kind}`),
          color: KIND_COLOR[kind],
          dash: KIND_DASH[kind],
        },
      ];
    }),
  );
}

export function ArgumentPassageDialog(
  props: GraphViewProps & {
    tractate: string;
    page: string;
    onClose: () => void;
  },
) {
  const [extra, setExtra] = createSignal<PageGraph[]>([]);
  const [initial, setInitial] = createSignal<PageGraph | null>(null);
  const [snapshot, setSnapshot] = createSignal<SpineViewDaf[]>([]);
  const [linksLoading, setLinksLoading] = createSignal(false);
  const [loading, setLoading] = createSignal<string | null>(null);
  const [message, setMessage] = createSignal('');
  const initialSelection = props.groups
    .flatMap((g) => [...(g.children ?? []), g])
    .find((n) => n.selected);
  const [selected, setSelected] = createSignal<string | null>(
    initialSelection ? `${props.page}/${initialSelection.id}` : null,
  );
  const [reveal, setReveal] = createSignal<string>();
  const controller = new AbortController();
  let snapshotRequest: Promise<void> | undefined;
  onCleanup(() => controller.abort());
  const label = (page: string) => (lang() === 'he' ? pageLabelHe(page) : page);
  const pages = createMemo(() =>
    [
      qualifyPage(
        initial()
          ? {
              ...initial()!,
              groups: initial()!.groups.map((g) => {
                const current = props.groups.find((n) => n.id === g.id);
                return {
                  ...g,
                  actions: current?.actions,
                  actionsExpanded: current?.actionsExpanded,
                  actionsLabel: current?.actionsLabel,
                };
              }),
            }
          : { page: props.page, groups: props.groups, edges: props.edges },
      ),
      ...extra(),
    ].sort((a, b) => amudToNumber(a.page)! - amudToNumber(b.page)!),
  );
  const previous = () => adjacentAmud(props.tractate, pages()[0].page, -1);
  const next = () => adjacentAmud(props.tractate, pages().at(-1)!.page, 1);
  const get = async <T,>(path: string): Promise<T> => {
    const request = new AbortController();
    const abort = () => request.abort();
    controller.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 20_000);
    try {
      const response = await fetch(path, { signal: request.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', abort);
    }
  };
  const base = (route: string, page: string) =>
    `/api/${route}/${encodeURIComponent(props.tractate)}/${encodeURIComponent(page)}`;
  const load = async (page: string) => {
    if (loading()) return;
    setLoading(page);
    setMessage('');
    try {
      const [saved, derived] = await Promise.all([
        get<SavedPage>(base('statement-spine', page)),
        get<{ derived?: { fromSection: number; toSection: number; relation: string }[] }>(
          base('derived-flow', page),
        ).catch(() => ({ derived: [] })),
      ]);
      if (controller.signal.aborted) return;
      if (!saved.sections?.length) {
        setMessage(t('graph.pageCold', { page: label(page) }));
        return;
      }
      const graph = savedPageGraph(
        page,
        saved,
        (derived.derived ?? []).map(
          (e: { fromSection: number; toSection: number; relation: string }) => ({
            from: e.fromSection,
            to: e.toSection,
            kind: stmtRelKind(e.relation),
            derived: true,
          }),
        ),
      );
      if (page === props.page) setInitial(graph);
      else {
        const qualified = qualifyPage(graph);
        setExtra((p) => [...p, qualified]);
        setReveal(qualified.groups[0].id);
      }
      if (page !== props.page && !snapshotRequest) {
        setLinksLoading(true);
        snapshotRequest = get<{ dapim?: SpineViewDaf[] }>(
          `/api/spine-view/${encodeURIComponent(props.tractate)}?cached=1`,
        )
          .then((result) => {
            if (!controller.signal.aborted) setSnapshot(result.dapim ?? []);
          })
          .catch(() => {
            snapshotRequest = undefined;
          })
          .finally(() => {
            if (!controller.signal.aborted) setLinksLoading(false);
          });
      }
    } catch {
      if (!controller.signal.aborted) setMessage(t('graph.pageFailed', { page: label(page) }));
    } finally {
      if (!controller.signal.aborted) setLoading(null);
    }
  };
  // Overview may show just one discussion. Opening the passage reads every
  // saved section on its daf, without starting generation or changing the reader.
  onMount(() => void load(props.page));
  const groups = () =>
    pages().flatMap((p) =>
      p.groups.map((g) => ({
        ...g,
        reference: label(p.page),
        selected: selected()
          ? selected() === g.id || selected()!.startsWith(`${g.id}:statement:`)
          : g.selected,
        children: g.children?.map((n) => ({ ...n, selected: selected() === n.id })),
      })),
    );
  const missingBoundary = () =>
    pages()
      .slice(0, -1)
      .some((p) => !snapshot().some((d) => d.page === p.page && d.crossComputed));
  return (
    <GraphDialog
      {...props}
      groups={groups()}
      edges={[...pages().flatMap((p) => p.edges), ...passageConnections(pages(), snapshot())]}
      onSelect={(node) => {
        setSelected(node.id);
        const prefix = `${props.page}/`;
        if (node.id.startsWith(prefix))
          props.onSelect?.({ ...node, id: node.id.slice(prefix.length) });
      }}
      onToggleActions={(g) => {
        const prefix = `${props.page}/`;
        if (g.id.startsWith(prefix))
          props.onToggleActions?.({ ...g, id: g.id.slice(prefix.length) });
      }}
      revealId={reveal()}
      toolbar={
        <div class="ui-graph-range">
          <span>
            {props.tractate} {label(pages()[0].page)}
            <Show when={pages().length > 1}>–{label(pages().at(-1)!.page)}</Show>
          </span>
          <Show when={previous()}>
            {(p) => (
              <button type="button" disabled={!!loading()} onClick={() => void load(p())}>
                {t('graph.addPrevious', { page: label(p()) })}
              </button>
            )}
          </Show>
          <Show when={next()}>
            {(p) => (
              <button type="button" disabled={!!loading()} onClick={() => void load(p())}>
                {t('graph.addNext', { page: label(p()) })}
              </button>
            )}
          </Show>
        </div>
      }
      status={
        <>
          <Show when={loading() || message()}>
            <p class="ui-graph-status" role="status">
              {loading() ? t('graph.loadingPage', { page: label(loading()!) }) : message()}
            </p>
          </Show>
          <Show when={pages().some((p) => p.movesComputed === false)}>
            <p class="ui-graph-status">
              {t('graph.statementsMissing', {
                pages: pages()
                  .filter((p) => p.movesComputed === false)
                  .map((p) => label(p.page))
                  .join(', '),
              })}
            </p>
          </Show>
          <Show when={linksLoading()}>
            <p class="ui-graph-status" role="status">
              {t('graph.loadingLinks')}
            </p>
          </Show>
          <Show when={!linksLoading() && missingBoundary()}>
            <p class="ui-graph-status">{t('graph.linksUnavailable')}</p>
          </Show>
        </>
      }
    />
  );
}
