/**
 * RunTreeDock — dev-mode RIGHT SIDE PANEL showing the BUILD PROVENANCE of a piece
 * on the current daf as a click-to-expand dependency DAG, backed by the read-only
 * GET /api/run-tree endpoint.
 *
 * Layout matches the app's argument-flow / voice maps: nodes stacked vertically
 * (root at top, its dependencies below, expanding downward), with connectors
 * routed through a right-side lane — orthogonal, straight runs with rounded
 * turns, lane-assigned so parallel edges never overlap (same edgePath/assignLanes
 * approach as ArgumentFlowGraph). Source nodes carry a database icon (fetched, no
 * cost); LLM nodes a sparkle (model + $). Click a node to open it (lazy-loads its
 * prompt + generation via /api/run); click its ⊕ to reveal its inputs. Shared
 * nodes (e.g. gemara) appear once with fan-in edges.
 *
 * Nodes are HTML cards (rich styling) over an SVG edge layer. The header rolls up
 * the COLD build cost/time, each shared node counted once. Resizable width.
 */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
} from 'solid-js';
import {
  type DafRun,
  dafRunRows,
  dafRunsLoading,
  liveCounts,
  liveLoading,
  refetchDafRuns,
} from './dafRunsStore';
import { lang } from './i18n';
import { inspectRequest } from './inspectBridge';
import {
  ACTIVE_STROKE,
  AuthorityBadge,
  BADGE_LLM,
  BADGE_PRO,
  BADGE_SRC,
  CANVAS,
  CANVAS_BORDER,
  CARD_STROKE,
  computeLayout,
  displayLabel,
  edgePath,
  fmtCost,
  fmtMs,
  type IconVariant,
  type LaidEdge,
  type Layout,
  LEFT_PAD,
  NODE_H,
  NODE_W,
  NodeIcon,
  ProvenanceSection,
  ROW_H,
  type RunResult,
  type RunTree,
  STALENESS_COLOR,
  StalenessDot,
  TOP_PAD,
  type TreeNode,
  variantOf,
} from './runTreeShared';

// DafRun (the shared snapshot row) is imported from dafRunsStore — the load bar
// reads the same rows, so the two surfaces can't drift.

/** One waterfall row — a piece run with a cold-time bar. Used as the collapsed
 *  header (the selected run) and as each row of the full waterfall list. */
function RunRow(props: {
  run: DafRun;
  maxMs: number;
  active?: boolean;
  collapsed?: boolean;
  loading?: boolean;
  loadingCount?: number;
  onClick?: () => void;
  onInspect?: () => void;
}): JSX.Element {
  const r = () => props.run;
  const isLLM = () => r().kind === 'llm';
  const slow = () => (r().cold_ms ?? 0) > 10_000;
  const color = () => (isLLM() ? (r().model?.includes('pro') ? BADGE_PRO : BADGE_LLM) : BADGE_SRC);
  const pct = () => Math.max(2, Math.round(((r().cold_ms ?? 0) / props.maxMs) * 100));
  // Per-instance fraction (e.g. 3/5 pesukim warmed). `anyCached` keeps the bar
  // and badge honest for a partially-warmed producer (cost > 0 yet cached=false).
  const inst = () => r().instances;
  const frac = () => {
    const i = inst();
    return i && i.total > 0 && i.cached < i.total ? `${i.cached}/${i.total}` : null;
  };
  const anyCached = () => r().cached || (inst()?.cached ?? 0) > 0;
  return (
    // biome-ignore lint/a11y/useSemanticElements: row contains a nested inspect <button>; a native button cannot contain another button
    <div
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onClick?.();
        }
      }}
      title={r().id}
      style={{
        display: 'flex',
        'align-items': 'center',
        gap: '0.5rem',
        padding: '0.3rem 0.6rem',
        cursor: props.onClick ? 'pointer' : 'default',
        'border-left': `2px solid ${props.active ? ACTIVE_STROKE : 'transparent'}`,
        background: props.active ? '#fdf2f2' : 'transparent',
      }}
    >
      <NodeIcon variant={variantOf(r())} color={color()} />
      <span
        style={{
          width: '8.5rem',
          'flex-shrink': 0,
          'font-size': '0.8rem',
          'white-space': 'nowrap',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
        }}
      >
        {displayLabel(r().id, r().label)}
      </span>
      <div
        style={{
          flex: 1,
          'min-width': '20px',
          height: '8px',
          background: '#eae5d8',
          'border-radius': '3px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Show
          when={props.loading}
          fallback={
            <div
              style={{
                width: `${pct()}%`,
                height: '100%',
                background: !anyCached()
                  ? '#ddd7c9'
                  : slow()
                    ? '#a8542e'
                    : isLLM()
                      ? '#c79a4a'
                      : '#aab2ba',
              }}
            />
          }
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'repeating-linear-gradient(90deg,#cf9b86 0 8px,#e8d3c7 8px 16px)',
              animation: 'daf-pulse 1.2s ease-in-out infinite',
            }}
          />
        </Show>
      </div>
      <span
        style={{
          width: '2.7rem',
          'text-align': 'right',
          'font-variant-numeric': 'tabular-nums',
          'font-size': '0.72rem',
          color: slow() ? '#9c4f29' : '#8a857c',
          'flex-shrink': 0,
        }}
      >
        {props.loading ? '…' : fmtMs(r().cold_ms)}
      </span>
      <span
        style={{
          width: '3.7rem',
          'text-align': 'right',
          'font-variant-numeric': 'tabular-nums',
          'font-size': '0.72rem',
          color: isLLM() ? '#4a7a5f' : '#bcae9a',
          'flex-shrink': 0,
        }}
      >
        {isLLM() ? fmtCost(r().cost) : '—'}
      </span>
      {/* staleness dot — only when the payload carries a verdict (cached rows) */}
      <span
        style={{
          width: '10px',
          'flex-shrink': 0,
          display: 'inline-flex',
          'justify-content': 'center',
        }}
      >
        <Show when={!props.loading && r().staleness}>
          {(s) => <StalenessDot staleness={s()} isMark={r().producer === 'mark'} />}
        </Show>
      </span>
      <span
        style={{ width: '1.9rem', 'text-align': 'right', 'font-size': '0.62rem', 'flex-shrink': 0 }}
      >
        <Show
          when={props.loading}
          fallback={
            <Show
              when={frac()}
              fallback={
                <Show when={r().cached} fallback={<span style={{ color: '#a8854a' }}>miss</span>}>
                  <span style={{ color: '#5f8a6f' }}>hit</span>
                </Show>
              }
            >
              {(f) => (
                <span
                  title={`${inst()?.cached} of ${inst()?.total} instances cached`}
                  style={{ color: '#a8854a' }}
                >
                  {f()}
                </span>
              )}
            </Show>
          }
        >
          <span style={{ color: '#9c5a2a' }}>
            run{props.loadingCount && props.loadingCount > 1 ? ` ${props.loadingCount}` : ''}
          </span>
        </Show>
      </span>
      <Show when={props.collapsed}>
        <span style={{ color: '#bbb', 'font-size': '0.7rem', 'flex-shrink': 0 }}>▾</span>
      </Show>
      <Show when={props.onInspect}>
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onInspect!();
          }}
          title="open this piece's build graph"
          style={{
            'flex-shrink': 0,
            width: '17px',
            height: '17px',
            'border-radius': '50%',
            border: '1px solid #d8c9c0',
            background: '#fff',
            color: '#8a7d74',
            cursor: 'pointer',
            'font-size': '0.66rem',
            'font-style': 'italic',
            'font-family': 'Georgia, serif',
            'line-height': 1,
            display: 'inline-flex',
            'align-items': 'center',
            'justify-content': 'center',
            padding: 0,
          }}
        >
          i
        </button>
      </Show>
    </div>
  );
}

/** Studio secret for the privileged rewarm endpoint — the SAME localStorage
 *  convention as MarksRegistryPanel's studioHeaders(): the owner sets it once
 *  via `localStorage.setItem('talmud_studio_secret', '<secret>')`. */
function studioSecret(): string | null {
  try {
    return localStorage.getItem('talmud_studio_secret');
  } catch {
    return null;
  }
}

interface StaleVerdict {
  status: 'fresh' | 'stale' | 'unknown' | 'miss' | 'n/a';
  cached_recipe?: string | null;
  current_recipe?: string | null;
}
interface Dependents {
  id: string;
  direct: string[];
  transitive: string[];
  count: number;
}

/** Collapsed-by-default freshness section for the currently drilled producer:
 *  the /api/stale recipe verdict, the /api/dependents re-warm blast radius, and
 *  a studio-gated 'Rewarm cascade' button (POST /api/admin/rewarm). */
function FreshnessPanel(props: {
  tractate: string;
  page: string;
  pieceId: string;
  onRewarmed: () => void;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [rewarm, setRewarm] = createSignal<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'ok'; runId: string }
    | { kind: 'err'; msg: string }
  >({ kind: 'idle' });
  // New piece → stale rewarm status no longer applies.
  createEffect(() => {
    void props.pieceId;
    setRewarm({ kind: 'idle' });
  });
  const [stale] = createResource(
    () => (open() ? `${props.tractate}|${props.page}|${props.pieceId}|${lang()}` : null),
    async (): Promise<StaleVerdict> => {
      const r = await fetch(
        `/api/stale/${encodeURIComponent(props.pieceId)}/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}?lang=${lang()}`,
      );
      // 404 = not an enrichment (marks have no recipe stamp / stale probe).
      if (!r.ok) return { status: 'n/a' };
      return (await r.json()) as StaleVerdict;
    },
  );
  const [deps] = createResource(
    () => (open() ? props.pieceId : null),
    async (): Promise<Dependents | null> => {
      const r = await fetch(`/api/dependents/${encodeURIComponent(props.pieceId)}`);
      return r.ok ? ((await r.json()) as Dependents) : null;
    },
  );
  const verdictColor = (s: StaleVerdict['status']): string =>
    s === 'fresh'
      ? STALENESS_COLOR.fresh
      : s === 'stale'
        ? STALENESS_COLOR['stale-recipe']
        : s === 'unknown'
          ? STALENESS_COLOR.unknown
          : '#bbb';
  const doRewarm = async () => {
    const secret = studioSecret();
    if (!secret) return;
    setRewarm({ kind: 'busy' });
    try {
      const r = await fetch(
        `/api/admin/rewarm/${encodeURIComponent(props.pieceId)}/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}?lang=${lang()}`,
        { method: 'POST', headers: { 'x-studio-secret': secret } },
      );
      const j = (await r.json()) as { runId?: string; error?: string };
      if (!r.ok || !j.runId) {
        setRewarm({ kind: 'err', msg: j.error ?? `HTTP ${r.status}` });
        return;
      }
      setRewarm({ kind: 'ok', runId: j.runId });
      props.onRewarmed();
    } catch (e) {
      setRewarm({ kind: 'err', msg: String(e) });
    }
  };
  const mono = { 'font-family': 'ui-monospace, Menlo, monospace' } as const;
  return (
    <details
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      style={{ 'border-top': '1px solid #eee', 'flex-shrink': 0, background: '#fcfcfa' }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '0.35rem 0.7rem',
          'font-size': '0.72rem',
          color: '#777',
          'user-select': 'none',
        }}
      >
        Freshness · <span style={mono}>{props.pieceId}</span>
      </summary>
      <div style={{ padding: '0.2rem 0.7rem 0.6rem', 'font-size': '0.74rem' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '0.45rem' }}>
          <span style={{ color: '#999', 'font-size': '0.68rem' }}>recipe</span>
          <Show when={stale()} fallback={<span style={{ color: '#bbb' }}>checking…</span>}>
            {(s) => (
              <span
                title={
                  s().status === 'n/a'
                    ? 'no stale probe for this producer (marks don’t stamp a recipe hash)'
                    : `cached ${s().cached_recipe?.slice(0, 12) ?? '—'} vs current ${s().current_recipe?.slice(0, 12) ?? '—'}`
                }
                style={{
                  ...mono,
                  'font-size': '0.7rem',
                  color: '#fff',
                  background: verdictColor(s().status),
                  'border-radius': '4px',
                  padding: '0.05rem 0.45rem',
                }}
              >
                {s().status}
              </span>
            )}
          </Show>
          <button
            type="button"
            onClick={doRewarm}
            disabled={!studioSecret() || rewarm().kind === 'busy'}
            title={
              studioSecret()
                ? 'evict + regenerate this producer and its whole dependent cascade on this daf'
                : "set localStorage 'talmud_studio_secret' to enable rewarm"
            }
            style={{
              'margin-left': 'auto',
              font: 'inherit',
              'font-size': '0.7rem',
              padding: '0.15rem 0.55rem',
              'border-radius': '4px',
              border: '1px solid #d8c9c0',
              background: '#fff',
              color: studioSecret() ? '#8a2a2b' : '#bbb',
              cursor: studioSecret() ? 'pointer' : 'not-allowed',
            }}
          >
            {rewarm().kind === 'busy' ? 'rewarming…' : 'Rewarm cascade'}
          </button>
        </div>
        <Show when={!studioSecret()}>
          <div style={{ color: '#bbb', 'font-size': '0.66rem', 'margin-top': '0.2rem' }}>
            rewarm needs the studio secret (localStorage 'talmud_studio_secret')
          </div>
        </Show>
        <Show when={rewarm().kind === 'ok'}>
          <div style={{ color: '#15803d', 'font-size': '0.7rem', 'margin-top': '0.25rem' }}>
            enqueued <span style={mono}>{(rewarm() as { runId: string }).runId}</span>
          </div>
        </Show>
        <Show when={rewarm().kind === 'err'}>
          <div style={{ color: '#b91c1c', 'font-size': '0.7rem', 'margin-top': '0.25rem' }}>
            {(rewarm() as { msg: string }).msg}
          </div>
        </Show>
        <div style={{ 'margin-top': '0.35rem' }}>
          <span style={{ color: '#999', 'font-size': '0.68rem' }}>
            rewarm cascade ({deps()?.count ?? 0})
          </span>
          <div
            style={{
              display: 'flex',
              'flex-wrap': 'wrap',
              gap: '0.25rem',
              'margin-top': '0.25rem',
            }}
          >
            <Show when={(deps()?.transitive ?? []).length === 0}>
              <span style={{ color: '#bbb', 'font-size': '0.7rem' }}>
                nothing depends on this producer
              </span>
            </Show>
            <For each={deps()?.transitive ?? []}>
              {(d) => (
                <span
                  style={{
                    ...mono,
                    'font-size': '0.66rem',
                    background: '#f1f1f3',
                    color: '#555',
                    'border-radius': '4px',
                    padding: '0.05rem 0.4rem',
                  }}
                >
                  {d}
                </span>
              )}
            </For>
          </div>
        </div>
      </div>
    </details>
  );
}

export default function RunTreeDock(props: {
  tractate: string;
  page: string;
  open: boolean;
  onClose: () => void;
  /** Slots for the other dev panels — rendered in their tabs, always mounted
   *  (the marks panel's effects drive the gutter even when the panel is shut). */
  marks?: JSX.Element;
  checks?: JSX.Element;
  sections?: JSX.Element;
}): JSX.Element {
  const [tab, setTab] = createSignal<'build' | 'marks' | 'checks' | 'sections'>('build');
  // Open onto the waterfall; a row's (i) drills into that piece's DAG.
  const [view, setView] = createSignal<'waterfall' | 'dag'>('waterfall');
  const [typeFilter, setTypeFilter] = createSignal<Set<IconVariant>>(
    new Set(['source', 'mark', 'enrichment']),
  );
  const toggleType = (v: IconVariant) =>
    setTypeFilter((prev) => {
      const n = new Set(prev);
      n.has(v) ? n.delete(v) : n.add(v);
      return n.size ? n : prev;
    });
  const [pieceId, setPieceId] = createSignal('tidbit.essay');
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set(['tidbit.essay']));
  const [selected, setSelected] = createSignal<string | null>('tidbit.essay');
  const [width, setWidth] = createSignal(Math.min(620, Math.round(window.innerWidth * 0.42)));
  const [detailH, setDetailH] = createSignal(Math.round(window.innerHeight * 0.34));

  // Waterfall feed + live overlay come from the SHARED dafRunsStore — the load bar
  // reads the same snapshot, so the two surfaces can't drift. The store owns the
  // fetch (keyed by the open daf) and the refetch-while-warming poll; the dock
  // only reads. `liveLoading`/`liveCounts` are the store's aiActivity overlay.
  const runs = dafRunRows;
  const maxCold = createMemo(() => Math.max(1, ...runs().map((r) => r.cold_ms ?? 0)));
  const _dafTotals = createMemo(() => {
    const rs = runs();
    return {
      count: rs.length,
      cached: rs.filter((r) => r.cached).length,
      cost: rs.reduce((s, r) => s + (r.cost ?? 0), 0),
      cold_ms: rs.reduce((s, r) => s + (r.cold_ms ?? 0), 0),
    };
  });
  // Waterfall rows after the type filter; actively-loading pieces float to the top.
  const visibleRuns = createMemo(() => {
    const live = liveLoading();
    return (runs() ?? [])
      .filter((r) => typeFilter().has(variantOf(r)))
      .sort((a, b) => (live.has(b.id) ? 1 : 0) - (live.has(a.id) ? 1 : 0));
  });
  // Per-instance focus (a mark_input) when an (i) inspects e.g. one section's
  // synthesis; null = whole-daf. Cleared when navigating via the waterfall.
  const [focusInstance, setFocusInstance] = createSignal<unknown>(null);
  const openPiece = (id: string, instance: unknown = null) => {
    setPieceId(id);
    setFocusInstance(instance);
    setExpanded(new Set([id]));
    setSelected(id);
    setView('dag');
  };

  // An (i) / card affordance anywhere asked to inspect a piece — focus its DAG.
  // (DafViewer opens the panel on the same request.)
  createEffect(() => {
    const req = inspectRequest();
    if (req) {
      setTab('build');
      openPiece(req.piece, req.instance ?? null);
    }
  });

  // The instance query-string for the ROOT piece (omitted for whole-daf).
  const instanceQS = (): string => {
    const inst = focusInstance();
    if (!inst || (typeof inst === 'object' && Object.keys(inst as object).length === 0)) return '';
    return `&instance=${encodeURIComponent(JSON.stringify(inst))}`;
  };

  const [tree] = createResource(
    () =>
      props.open && view() === 'dag'
        ? `${props.tractate}|${props.page}|${pieceId()}|${lang()}|${instanceQS()}`
        : null,
    async (): Promise<RunTree | null> => {
      const r = await fetch(
        `/api/run-tree/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}/${encodeURIComponent(pieceId())}?lang=${lang()}${instanceQS()}`,
      );
      if (!r.ok) return null;
      return (await r.json()) as RunTree;
    },
  );

  const layout = createMemo<Layout | null>(() => {
    const t = tree();
    return t ? computeLayout(t, expanded()) : null;
  });
  const nodeOf = (id: string): TreeNode | undefined => tree()?.nodes[id];
  const hasKids = (id: string): boolean => !!tree()?.edges.some((e) => e[0] === id);
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const badgeColor = (n: TreeNode) =>
    n.kind !== 'llm' ? BADGE_SRC : n.model?.includes('pro') ? BADGE_PRO : BADGE_LLM;

  // The selected node + everything one edge away — for the focus highlight
  // (incident edges drawn bold, the rest faded).
  const connected = createMemo<Set<string>>(() => {
    const sel = selected();
    const lay = layout();
    if (!sel || !lay) return new Set();
    const set = new Set<string>([sel]);
    for (const e of lay.edges) {
      if (e.fromId === sel) set.add(e.toId);
      if (e.toId === sel) set.add(e.fromId);
    }
    return set;
  });
  const isIncident = (e: LaidEdge) => e.fromId === selected() || e.toId === selected();

  const [detail] = createResource(
    () => {
      const id = selected();
      const n = id ? nodeOf(id) : null;
      return n && n.kind !== 'source' && n.producer
        ? { id, producer: n.producer, root: id === pieceId() }
        : null;
    },
    async (sel): Promise<RunResult | null> => {
      // The clicked root resolves at its instance (so a per-section synthesis
      // shows its real generation); other nodes at whole-daf.
      const markInput = sel.root ? (focusInstance() ?? { fields: {} }) : { fields: {} };
      const body =
        sel.producer === 'mark'
          ? { mark_id: sel.id, tractate: props.tractate, page: props.page, lang: lang() }
          : {
              enrichment_id: sel.id,
              tractate: props.tractate,
              page: props.page,
              mark_input: markInput,
              lang: lang(),
            };
      const r = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { status?: string; result?: RunResult } | RunResult;
      if (j && typeof j === 'object' && 'status' in j)
        return j.status === 'ok' ? (j.result ?? null) : null;
      return j as RunResult;
    },
  );

  const onResizeStart = (ev: MouseEvent) => {
    ev.preventDefault();
    document.body.style.userSelect = 'none';
    const move = (e: MouseEvent) =>
      setWidth(Math.max(380, Math.min(window.innerWidth - 120, window.innerWidth - e.clientX)));
    const up = () => {
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  // Drag the divider between the DAG and the node-detail pane to resize it.
  const onDetailResizeStart = (ev: MouseEvent) => {
    ev.preventDefault();
    document.body.style.userSelect = 'none';
    const move = (e: MouseEvent) =>
      setDetailH(Math.max(110, Math.min(window.innerHeight - 160, window.innerHeight - e.clientY)));
    const up = () => {
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const nodeY = (id: string) => {
    const r = layout()!.rowOf.get(id)!;
    return TOP_PAD + r * ROW_H;
  };

  // Push the daf left by the panel width when open (mirrors the old left shelf).
  createEffect(() => {
    if (props.open) {
      document.body.style.setProperty('--dev-panel-width', `${width()}px`);
      document.body.classList.add('dev-panel-open');
    } else {
      document.body.classList.remove('dev-panel-open');
      document.body.style.removeProperty('--dev-panel-width');
    }
  });
  onCleanup(() => {
    document.body.classList.remove('dev-panel-open');
    document.body.style.removeProperty('--dev-panel-width');
  });

  const TABS: Array<{ id: 'build' | 'marks' | 'checks' | 'sections'; label: string }> = [
    { id: 'build', label: 'Build' },
    { id: 'marks', label: 'Marks' },
    { id: 'checks', label: 'Checks' },
    { id: 'sections', label: 'Sections' },
  ];

  // The aside is ALWAYS rendered (display toggled) so the slotted panels — the
  // marks panel especially — stay mounted and keep driving the gutter even when
  // the dev panel is closed. Only visibility changes with `open`.
  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: `${width()}px`,
        background: '#fff',
        'border-left': '2px solid #111',
        'box-shadow': '-6px 0 24px rgba(0,0,0,0.13)',
        'z-index': 1000,
        display: props.open ? 'flex' : 'none',
        'flex-direction': 'column',
        'font-family': 'system-ui, sans-serif',
        'font-size': '13px',
      }}
    >
      {/* resize handle (left edge) */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-to-resize handle; the interaction is pointer-position-driven (mousemove), there is no keyboard equivalent */}
      <div
        onMouseDown={onResizeStart}
        title="drag to resize"
        style={{
          position: 'absolute',
          top: 0,
          left: '-4px',
          bottom: 0,
          width: '9px',
          cursor: 'ew-resize',
          'z-index': 1002,
        }}
      />

      {/* tab bar */}
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '0.15rem',
          padding: '0.35rem 0.6rem',
          'border-bottom': '1px solid #eee',
          background: '#fafafa',
          'flex-shrink': 0,
        }}
      >
        <For each={TABS}>
          {(t) => (
            <button
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                font: 'inherit',
                'font-size': '0.74rem',
                cursor: 'pointer',
                border: 'none',
                background: tab() === t.id ? '#eef0f2' : 'transparent',
                'border-radius': '5px',
                padding: '0.25rem 0.55rem',
                color: tab() === t.id ? '#111' : '#888',
                'font-weight': tab() === t.id ? 500 : 400,
              }}
            >
              {t.label}
            </button>
          )}
        </For>
        <span style={{ 'font-size': '0.7rem', color: '#bbb', 'margin-left': '0.3rem' }}>
          {props.tractate} {props.page}
        </span>
        <button
          type="button"
          onClick={props.onClose}
          style={{
            'margin-left': 'auto',
            padding: '2px 10px',
            cursor: 'pointer',
            background: '#fff',
            border: '1px solid #ccc',
            'border-radius': '4px',
            'font-size': '0.74rem',
            color: '#555',
          }}
        >
          close
        </button>
      </div>

      {/* === BUILD tab === */}
      <div
        style={{
          display: tab() === 'build' ? 'flex' : 'none',
          'flex-direction': 'column',
          flex: 1,
          'min-height': 0,
        }}
      >
        {/* collapsed waterfall row (DAG mode) — click to expand the full waterfall */}
        <Show when={view() === 'dag'}>
          <div style={{ 'border-bottom': '1px solid #eee', 'flex-shrink': 0 }}>
            <RunRow
              run={
                (runs() ?? []).find((r) => r.id === pieceId()) ?? {
                  id: pieceId(),
                  label: pieceId(),
                  kind: 'llm',
                  producer: 'enrichment',
                  cached: !!tree(),
                  cold_ms: tree()?.totals.cold_ms ?? null,
                  cost: tree()?.totals.cost ?? null,
                  tokens: null,
                }
              }
              maxMs={maxCold()}
              collapsed
              active
              onClick={() => setView('waterfall')}
            />
          </div>
        </Show>

        {/* full waterfall (Activity mode) */}
        <Show when={view() === 'waterfall'}>
          {/* type filters */}
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.6rem',
              'border-bottom': '1px solid #f0f0f0',
              'flex-shrink': 0,
            }}
          >
            <For
              each={
                [
                  { v: 'source', l: 'sources' },
                  { v: 'mark', l: 'marks' },
                  { v: 'enrichment', l: 'generations' },
                ] as const
              }
            >
              {(f) => {
                const on = () => typeFilter().has(f.v);
                const c = f.v === 'source' ? BADGE_SRC : f.v === 'mark' ? BADGE_LLM : BADGE_PRO;
                return (
                  <button
                    type="button"
                    onClick={() => toggleType(f.v)}
                    style={{
                      display: 'inline-flex',
                      'align-items': 'center',
                      gap: '0.3rem',
                      cursor: 'pointer',
                      font: 'inherit',
                      'font-size': '0.72rem',
                      border: `1px solid ${on() ? c : '#e2e2e2'}`,
                      background: on() ? `${c}14` : '#fff',
                      color: on() ? c : '#aaa',
                      'border-radius': '999px',
                      padding: '0.1rem 0.5rem',
                    }}
                  >
                    <NodeIcon variant={f.v} color={on() ? c : '#bbb'} />
                    {f.l}
                  </button>
                );
              }}
            </For>
            <span style={{ 'margin-left': 'auto', 'font-size': '0.68rem', color: '#bbb' }}>
              {visibleRuns().length} of {(runs() ?? []).length}
            </span>
          </div>
          <div style={{ flex: 1, 'min-height': 0, overflow: 'auto' }}>
            <Show when={dafRunsLoading()}>
              <div style={{ padding: '0.6rem', color: '#aaa' }}>loading…</div>
            </Show>
            <For each={visibleRuns()}>
              {(r) => (
                <RunRow
                  run={r}
                  maxMs={maxCold()}
                  active={r.id === pieceId()}
                  loading={liveLoading().has(r.id)}
                  loadingCount={liveCounts().get(r.id) ?? 0}
                  onClick={() => openPiece(r.id)}
                  onInspect={() => openPiece(r.id)}
                />
              )}
            </For>
          </div>
        </Show>

        {/* DAG (top, scrollable) */}
        <Show when={view() === 'dag'}>
          <div
            style={{
              flex: 1,
              'min-height': 0,
              overflow: 'auto',
              background: CANVAS,
              padding: '0.5rem',
            }}
          >
            <Show when={tree.loading}>
              <div style={{ padding: '0.5rem', color: '#aaa' }}>loading…</div>
            </Show>
            <Show when={tree() === null && !tree.loading}>
              <div style={{ padding: '0.5rem', color: '#c00' }}>
                no graph (unknown piece, or nothing cached)
              </div>
            </Show>
            <Show when={layout()}>
              {(lay) => (
                <div
                  style={{
                    position: 'relative',
                    width: `${lay().width}px`,
                    height: `${lay().height}px`,
                    border: `1px solid ${CANVAS_BORDER}`,
                    'border-radius': '8px',
                    background: CANVAS,
                  }}
                >
                  {/* edge layer */}
                  <svg
                    aria-hidden="true"
                    width={lay().width}
                    height={lay().height}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      'pointer-events': 'none',
                      overflow: 'visible',
                    }}
                  >
                    <defs>
                      <marker
                        id="rt-arrow"
                        markerWidth="8"
                        markerHeight="8"
                        refX="6"
                        refY="3"
                        orient="auto"
                      >
                        <path d="M0 0 L6 3 L0 6 z" fill="#c9b8b0" />
                      </marker>
                      <marker
                        id="rt-arrow-hot"
                        markerWidth="8"
                        markerHeight="8"
                        refX="6"
                        refY="3"
                        orient="auto"
                      >
                        <path d="M0 0 L6 3 L0 6 z" fill="#8a2a2b" />
                      </marker>
                    </defs>
                    <For each={lay().edges}>
                      {(e) => {
                        const hot = () => isIncident(e);
                        const faded = () => !!selected() && !hot();
                        return (
                          // arrow points dependency -> consumer ("what feeds into what")
                          <path
                            d={edgePath(e.toRow, e.fromRow, e.lane)}
                            fill="none"
                            stroke={hot() ? '#8a2a2b' : '#d3c4ba'}
                            stroke-width={hot() ? 2 : 1.5}
                            stroke-opacity={faded() ? 0.22 : hot() ? 0.85 : 1}
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            marker-end={`url(#${hot() ? 'rt-arrow-hot' : 'rt-arrow'})`}
                          />
                        );
                      }}
                    </For>
                  </svg>
                  {/* node cards */}
                  <For each={lay().order}>
                    {(id) => {
                      const n = () => nodeOf(id)!;
                      const isLLM = () => n().kind === 'llm';
                      const sel = () => selected() === id;
                      const exp = () => expanded().has(id);
                      const slow = () => (n().cold_ms ?? 0) > 10_000;
                      const dim = () => !!selected() && !connected().has(id);
                      const activate = () => {
                        setSelected(id);
                        if (hasKids(id)) toggleExpand(id);
                      };
                      return (
                        // biome-ignore lint/a11y/useSemanticElements: node card contains a nested expand <button>; a native button cannot contain another button
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={activate}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              activate();
                            }
                          }}
                          style={{
                            position: 'absolute',
                            left: `${LEFT_PAD}px`,
                            top: `${nodeY(id)}px`,
                            width: `${NODE_W}px`,
                            height: `${NODE_H}px`,
                            display: 'flex',
                            'align-items': 'center',
                            gap: '0.5rem',
                            padding: '0 0.6rem',
                            cursor: 'pointer',
                            'box-sizing': 'border-box',
                            background: sel() ? '#fdf2f2' : '#fff',
                            border: `${sel() ? 1.75 : 1}px solid ${sel() ? ACTIVE_STROKE : CARD_STROKE}`,
                            'border-radius': '11px',
                            'box-shadow': '0 1px 2px rgba(58,51,32,0.08)',
                            opacity: dim() ? 0.42 : 1,
                            transition: 'opacity 0.12s',
                          }}
                        >
                          <NodeIcon variant={variantOf(n())} color={badgeColor(n())} />
                          <div style={{ flex: 1, 'min-width': 0 }}>
                            <div
                              style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem' }}
                            >
                              <span
                                style={{
                                  'font-weight': 600,
                                  'font-size': '0.84rem',
                                  color: '#2a2723',
                                  'white-space': 'nowrap',
                                  overflow: 'hidden',
                                  'text-overflow': 'ellipsis',
                                }}
                              >
                                {displayLabel(n().id, n().label)}
                              </span>
                              <span
                                style={{
                                  'margin-left': 'auto',
                                  'font-size': '0.68rem',
                                  'font-variant-numeric': 'tabular-nums',
                                  color: slow() ? '#b45309' : '#9a857c',
                                  'flex-shrink': 0,
                                }}
                              >
                                {fmtMs(n().cold_ms)}
                              </span>
                              <Show when={n().staleness}>
                                {(s) => (
                                  <StalenessDot
                                    staleness={s()}
                                    inputsChanged={n().inputsChanged}
                                    isMark={n().producer === 'mark'}
                                  />
                                )}
                              </Show>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                'align-items': 'center',
                                gap: '0.3rem',
                                'font-size': '0.66rem',
                                'font-family': 'ui-monospace, Menlo, monospace',
                                color: isLLM() ? '#9a8fb5' : '#9aa4ad',
                                'white-space': 'nowrap',
                                overflow: 'hidden',
                                'text-overflow': 'ellipsis',
                              }}
                            >
                              <Show when={n().authority}>
                                {(a) => <AuthorityBadge authority={a()} />}
                              </Show>
                              {isLLM()
                                ? `${(n().model ?? '').split('/').pop()} · ${fmtCost(n().cost)}`
                                : 'source · $0'}
                            </div>
                          </div>
                          <Show when={hasKids(id)}>
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelected(id);
                                toggleExpand(id);
                              }}
                              title={exp() ? 'collapse inputs' : 'expand inputs'}
                              style={{
                                'flex-shrink': 0,
                                width: '18px',
                                height: '18px',
                                'border-radius': '50%',
                                border: '1px solid #d8c9c0',
                                background: '#fff',
                                color: '#8a7d74',
                                cursor: 'pointer',
                                'font-size': '0.8rem',
                                'line-height': 1,
                                display: 'inline-flex',
                                'align-items': 'center',
                                'justify-content': 'center',
                                padding: 0,
                              }}
                            >
                              {exp() ? '–' : '+'}
                            </button>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              )}
            </Show>
          </div>
        </Show>

        {/* freshness (collapsed) — the drilled producer's stale verdict +
            dependents cascade + the studio-gated rewarm action */}
        <Show when={view() === 'dag'}>
          <FreshnessPanel
            tractate={props.tractate}
            page={props.page}
            pieceId={pieceId()}
            onRewarmed={() => refetchDafRuns()}
          />
        </Show>

        {/* node detail (bottom) — DAG mode only; drag its top edge to resize */}
        <Show when={view() === 'dag'}>
          <div
            style={{
              height: `${detailH()}px`,
              'flex-shrink': 0,
              'border-top': '1px solid #eee',
              display: 'flex',
              'flex-direction': 'column',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-to-resize handle; the interaction is pointer-position-driven (mousemove), there is no keyboard equivalent */}
            <div
              onMouseDown={onDetailResizeStart}
              title="drag to resize"
              style={{
                position: 'absolute',
                top: '-3px',
                left: 0,
                right: 0,
                height: '7px',
                cursor: 'ns-resize',
                'z-index': 3,
              }}
            />
            <Show
              when={selected() ? nodeOf(selected()!) : null}
              fallback={<div style={{ padding: '0.7rem', color: '#bbb' }}>select a node</div>}
            >
              {(n) => (
                <>
                  <div
                    style={{
                      padding: '0.45rem 0.7rem',
                      'border-bottom': '1px solid #f0f0f0',
                      display: 'flex',
                      'flex-wrap': 'wrap',
                      gap: '0.35rem',
                      'align-items': 'center',
                    }}
                  >
                    <span
                      style={{
                        'font-weight': 600,
                        'font-size': '0.84rem',
                        'margin-right': '0.2rem',
                      }}
                    >
                      {displayLabel(n().id, n().label)}
                    </span>
                    <span
                      style={{
                        'font-size': '0.66rem',
                        background: '#f1f1f3',
                        'border-radius': '4px',
                        padding: '0.05rem 0.4rem',
                        color: '#555',
                        'font-family': 'ui-monospace, Menlo, monospace',
                      }}
                    >
                      {n().kind === 'source' ? 'source' : (n().model ?? 'llm')}
                    </span>
                    <Show when={n().cold_ms != null}>
                      <span
                        style={{
                          'font-size': '0.66rem',
                          background: '#f1f1f3',
                          'border-radius': '4px',
                          padding: '0.05rem 0.4rem',
                          color: '#555',
                          'font-family': 'ui-monospace, Menlo, monospace',
                        }}
                      >
                        gen {fmtMs(n().cold_ms)}
                      </span>
                    </Show>
                    <Show when={n().kind === 'llm'}>
                      <span
                        style={{
                          'font-size': '0.66rem',
                          background: '#ecfdf5',
                          'border-radius': '4px',
                          padding: '0.05rem 0.4rem',
                          color: '#047857',
                          'font-family': 'ui-monospace, Menlo, monospace',
                        }}
                      >
                        {fmtCost(n().cost)}
                      </span>
                    </Show>
                    <Show when={n().instances}>
                      {(i) => (
                        <span
                          style={{
                            'font-size': '0.66rem',
                            background: '#f1f1f3',
                            'border-radius': '4px',
                            padding: '0.05rem 0.4rem',
                            color:
                              i().cached === i().total && i().total > 0 ? '#047857' : '#a8854a',
                            'font-family': 'ui-monospace, Menlo, monospace',
                          }}
                          title="instances warmed on this daf"
                        >
                          {i().cached}/{i().total} cached
                        </span>
                      )}
                    </Show>
                    <span
                      style={{
                        'font-size': '0.66rem',
                        'border-radius': '4px',
                        padding: '0.05rem 0.4rem',
                        'font-family': 'ui-monospace, Menlo, monospace',
                        ...(n().cached
                          ? { background: '#dcfce7', color: '#15803d' }
                          : { background: '#fef3c7', color: '#b45309' }),
                      }}
                    >
                      {n().cached ? 'cached' : 'not cached'}
                    </span>
                  </div>
                  <div style={{ flex: 1, 'overflow-y': 'auto', padding: '0.6rem 0.7rem' }}>
                    <Show
                      when={n().kind === 'source'}
                      fallback={
                        <>
                          <Show when={detail.loading}>
                            <div style={{ color: '#aaa', 'font-size': '0.78rem' }}>
                              loading run…
                            </div>
                          </Show>
                          <Show when={detail()}>
                            {(r) => (
                              <>
                                <div
                                  style={{
                                    'line-height': 1.5,
                                    'font-size': '0.82rem',
                                    color: '#222',
                                    'white-space': 'pre-wrap',
                                  }}
                                >
                                  {(r().content ?? '').slice(0, 1600)}
                                </div>
                                <Show when={r().resolved}>
                                  {(res) => (
                                    <details style={{ 'margin-top': '0.7rem' }}>
                                      <summary
                                        style={{
                                          cursor: 'pointer',
                                          'font-size': '0.74rem',
                                          color: '#666',
                                        }}
                                      >
                                        prompt (system + user)
                                      </summary>
                                      <div
                                        style={{
                                          'font-size': '0.64rem',
                                          color: '#999',
                                          'margin-top': '0.3rem',
                                        }}
                                      >
                                        system
                                      </div>
                                      <pre
                                        style={{
                                          'white-space': 'pre-wrap',
                                          'font-family': 'ui-monospace, Menlo, monospace',
                                          'font-size': '11px',
                                          margin: 0,
                                          background: '#f8f8f8',
                                          padding: '0.5rem',
                                          'border-radius': '3px',
                                          'max-height': '24vh',
                                          overflow: 'auto',
                                        }}
                                      >
                                        {res().system_prompt}
                                      </pre>
                                      <div
                                        style={{
                                          'font-size': '0.64rem',
                                          color: '#999',
                                          margin: '0.3rem 0 0',
                                        }}
                                      >
                                        user
                                      </div>
                                      <pre
                                        style={{
                                          'white-space': 'pre-wrap',
                                          'font-family': 'ui-monospace, Menlo, monospace',
                                          'font-size': '11px',
                                          margin: 0,
                                          background: '#f8f8f8',
                                          padding: '0.5rem',
                                          'border-radius': '3px',
                                          'max-height': '24vh',
                                          overflow: 'auto',
                                        }}
                                      >
                                        {res().user_prompt}
                                      </pre>
                                    </details>
                                  )}
                                </Show>
                              </>
                            )}
                          </Show>
                          <Show when={!detail.loading && !detail()}>
                            <Show
                              when={
                                n().id === tree()?.root && (tree()?.rootInstances?.length ?? 0) > 0
                              }
                              fallback={
                                <div style={{ color: '#bbb', 'font-size': '0.78rem' }}>
                                  nothing cached for this node on this daf yet.
                                </div>
                              }
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  'flex-wrap': 'wrap',
                                  gap: '0.3rem',
                                  'align-items': 'center',
                                  'font-size': '0.78rem',
                                }}
                              >
                                <span style={{ color: '#999' }}>
                                  per-instance — pick one to inspect:
                                </span>
                                <For each={tree()?.rootInstances ?? []}>
                                  {(ri) => (
                                    <button
                                      type="button"
                                      onClick={() => openPiece(tree()!.root, ri.instance)}
                                      style={{
                                        'font-size': '0.72rem',
                                        padding: '0.1rem 0.45rem',
                                        border: '1px solid #d8d2c4',
                                        'border-radius': '4px',
                                        background: '#faf8f2',
                                        cursor: 'pointer',
                                        color: '#555',
                                      }}
                                    >
                                      {ri.label}
                                    </button>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </Show>
                          <ProvenanceSection node={n()} />
                        </>
                      }
                    >
                      <div style={{ 'font-size': '0.82rem', color: '#555' }}>
                        A <b>source</b> input — fetched/assembled, no model call (cost $0). The
                        piece's prompt reads its text.
                      </div>
                    </Show>
                  </div>
                </>
              )}
            </Show>
          </div>
        </Show>
      </div>
      {/* end BUILD tab */}

      {/* === MARKS tab === always mounted (its effects drive the gutter) === */}
      <div
        style={{
          display: tab() === 'marks' ? 'block' : 'none',
          flex: 1,
          'min-height': 0,
          'overflow-y': 'auto',
          padding: '0.5rem 0.7rem',
        }}
      >
        {props.marks}
      </div>
      {/* === CHECKS tab === */}
      <div
        style={{
          display: tab() === 'checks' ? 'block' : 'none',
          flex: 1,
          'min-height': 0,
          'overflow-y': 'auto',
          padding: '0.5rem 0.7rem',
        }}
      >
        {props.checks}
      </div>
      {/* === SECTIONS tab === */}
      <div
        style={{
          display: tab() === 'sections' ? 'block' : 'none',
          flex: 1,
          'min-height': 0,
          'overflow-y': 'auto',
          padding: '0.5rem 0.7rem',
        }}
      >
        {props.sections}
      </div>
    </aside>
  );
}
