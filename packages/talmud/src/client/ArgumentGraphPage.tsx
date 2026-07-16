/**
 * #argument — the daf ARGUMENT GRAPH page (replaces the old #voices page).
 * One readable walk of the whole daf's argument: every section in daf order,
 * its statements as rows (role, speaker, side, summary), the relations between
 * statements as labeled chips on the rows, and the section→section connections
 * as labeled chips on the section headers — the argument map and the voices
 * integrated into ONE view instead of two disconnected renderings of the same
 * underlying data.
 *
 * The "who speaks" strip at the top is the voice network folded into the
 * structure: click a person to light up their statements across every section.
 * The old abstract daf-wide voice network survives as a collapsed aggregate
 * view at the bottom (same DafVoiceGraph renderer).
 *
 * Read-only like the page it replaces — nothing generates here:
 *   - /api/daf-view (already cached client-side) supplies rabbi generations +
 *     the per-section voices the aggregate network stitches;
 *   - GET /api/statement-spine supplies sections + statements + the CACHED AI
 *     flow (empty when cold — never POSTs /api/run);
 *   - GET /api/derived-flow supplies the deterministic cross-section edges,
 *     merged UNDER the AI flow via mergeFlows (AI keeps final say).
 */
import { createMemo, createResource, createSignal, For, type JSX, Show } from 'solid-js';
import { dafRefHe } from '../lib/sefref';
import { buildArgumentPeople } from '../lib/typing/argumentPeople';
import {
  buildDafVoiceGraph,
  type SectionVoicesInput,
  type VoiceClass,
} from '../lib/typing/dafVoices';
import { mergeFlows } from '../lib/typing/flowMerge';
import type {
  StatementLink,
  StatementNode,
  StatementSpine as StatementSpineData,
} from '../lib/typing/statementSpine';
import type { ArgumentVoicesData } from '../lib/typing/voices';
import { type FlowConnection, KIND_COLOR, KIND_DASH, stmtRelKind } from './ArgumentFlowGraph';
import DafVoiceGraph from './DafVoiceGraph';
import { type DafViewPiece, loadDafView } from './dafViewStore';
import { colorForGeneration, GENERATION_BY_ID } from './generations';
import { lang, t } from './i18n';
import { roleColor, sideTint } from './StatementSpine';
import { resolveVoiceGroup } from './voiceGroups';

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
  startSegIdx: number;
  endSegIdx: number;
  spine: StatementSpineData;
}
interface SpinesResp {
  sections: SpineSection[];
  movesComputed: boolean;
  flow: { from: number; to: number; kind: string }[];
  failed?: boolean;
}

async function fetchSpines(tractate: string, page: string): Promise<SpinesResp> {
  try {
    const r = await fetch(
      `/api/statement-spine/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}`,
    );
    if (!r.ok) return { sections: [], movesComputed: false, flow: [], failed: true };
    const j = (await r.json()) as Partial<SpinesResp>;
    return {
      sections: Array.isArray(j.sections) ? j.sections : [],
      movesComputed: !!j.movesComputed,
      flow: Array.isArray(j.flow) ? j.flow : [],
    };
  } catch {
    return { sections: [], movesComputed: false, flow: [], failed: true };
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

/** A merged cross-section connection; `derived` marks the deterministic fills. */
type PageConn = { from: number; to: number; kind: FlowConnection['kind']; derived?: boolean };

const CARD_BORDER = '1px solid #ece7db';
// `supports` (raya / proof) keeps its own evidential hue — matching the
// statement-spine renderers (see STMT_SUPPORTS_COLOR in ArgumentFlowGraph).
const SUPPORTS_COLOR = '#0891b2';

function relationColor(rel: string): string {
  return rel === 'supports' ? SUPPORTS_COLOR : KIND_COLOR[stmtRelKind(rel)];
}
function relationLabel(rel: string): string {
  return rel === 'continues' ? t('link.rel.continues') : t(`dafvoices.rel.${rel}`);
}

type RabbiMarkParsed = {
  instances?: Array<{ fields?: { name?: string; nameHe?: string; generation?: string } }>;
};
type ArgumentMarkParsed = {
  instances?: Array<{ startSegIdx?: number; fields?: { title?: string } }>;
};

export function ArgumentGraphPage(): JSX.Element {
  const [ref, setRef] = createSignal<DafRef>(readRef());
  const sync = () => setRef(readRef());
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);

  const [payload] = createResource(
    () => `${ref().tractate}:${ref().page}:${lang()}`,
    async () => {
      const r = ref();
      return loadDafView(r.tractate, r.page, lang());
    },
  );
  const [spines] = createResource(
    () => `${ref().tractate}:${ref().page}`,
    async () => {
      const r = ref();
      return fetchSpines(r.tractate, r.page);
    },
  );
  const [derived] = createResource(
    () => `${ref().tractate}:${ref().page}`,
    async () => {
      const r = ref();
      return fetchDerived(r.tractate, r.page);
    },
  );

  // Rabbi generations from the daf view (name -> generation id), for coloring.
  const genByName = createMemo(() => {
    const m = new Map<string, string>();
    const rabbiParsed = payload()?.pieces?.rabbi?.parsed as RabbiMarkParsed | undefined;
    for (const inst of rabbiParsed?.instances ?? []) {
      const nm = inst.fields?.name?.trim();
      if (nm && inst.fields?.generation && !m.has(nm)) m.set(nm, inst.fields.generation);
    }
    return m;
  });

  const classify = (name: string): VoiceClass => ({
    collective: !!resolveVoiceGroup(name),
    generation: genByName().get(name),
  });

  const sections = (): SpineSection[] => spines()?.sections ?? [];

  // The "who speaks" strip: every statement's rabbiNames deduped into one
  // prominence-ordered cast list (speaker labels are descriptive, not names).
  const people = createMemo(() =>
    buildArgumentPeople(
      sections().map((s) => ({ index: s.index, nodes: s.spine.nodes })),
      classify,
    ),
  );

  // Cross-section connections: the cached AI flow, with the deterministic
  // statement-derived edges merged UNDER it (same semantics as the Overview map).
  const connections = createMemo<PageConn[]>(() => {
    const n = sections().length;
    const valid = (e: { from: number; to: number }) =>
      Number.isInteger(e.from) &&
      Number.isInteger(e.to) &&
      e.from !== e.to &&
      e.from >= 0 &&
      e.from < n &&
      e.to >= 0 &&
      e.to < n;
    const ai: PageConn[] = (spines()?.flow ?? []).filter(valid).map((e) => ({
      from: e.from,
      to: e.to,
      kind: (e.kind in KIND_COLOR ? e.kind : 'continues') as FlowConnection['kind'],
    }));
    const det: PageConn[] = (derived() ?? [])
      .map((d) => ({
        from: d.fromSection,
        to: d.toSection,
        kind: stmtRelKind(d.relation),
        derived: true,
      }))
      .filter(valid);
    return mergeFlows(ai, det);
  });

  // Person focus: click a person (in the strip or on a row) to light their
  // statements across the daf; everything else dims.
  const [focus, setFocus] = createSignal<string | null>(null);
  const toggleFocus = (name: string) => setFocus((f) => (f === name ? null : name));
  const involves = (node: StatementNode, f: string) => (node.rabbiNames ?? []).includes(f);
  const sectionOpacity = (sec: SpineSection) => {
    const f = focus();
    if (!f) return 1;
    return sec.spine.nodes.some((nd) => involves(nd, f)) ? 1 : 0.5;
  };
  // Rows only dim INSIDE a section the person speaks in (mixed rows); a section
  // they're absent from dims once as a whole — no compounding to near-invisible.
  const rowOpacity = (sec: SpineSection, node: StatementNode) => {
    const f = focus();
    if (!f || sectionOpacity(sec) < 1) return 1;
    return involves(node, f) ? 1 : 0.35;
  };
  const focusedPerson = () => people().find((p) => p.name === focus()) ?? null;

  // Click-to-navigate: scroll the target section / statement into view and
  // flash it briefly so the eye lands on the right row.
  const [flash, setFlash] = createSignal<string | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  const flashEl = (id: string, block: ScrollLogicalPosition) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block });
    setFlash(id);
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => setFlash(null), 1600);
  };
  const flashStyle = (id: string) =>
    flash() === id ? { outline: '2px solid #8a2a2b', 'outline-offset': '2px' } : {};

  // The aggregate people network (the old voice graph), fed the same way the
  // retired #voices page fed it: per-section voices riding each warmed
  // argument.synthesis piece in the daf view. Collapsed by default.
  const network = createMemo(() => {
    const pieces = (payload()?.pieces ?? {}) as Record<string, DafViewPiece>;
    const orderByTitle = new Map<string, number>();
    const argParsed = pieces.argument?.parsed as ArgumentMarkParsed | undefined;
    (argParsed?.instances ?? []).forEach((inst, i) => {
      const ti = inst.fields?.title?.trim();
      if (ti && !orderByTitle.has(ti)) {
        orderByTitle.set(ti, typeof inst.startSegIdx === 'number' ? inst.startSegIdx : i);
      }
    });
    const secs: SectionVoicesInput[] = [];
    for (const piece of Object.values(pieces)) {
      if (piece.producerId !== 'argument.synthesis') continue;
      const voices = piece.deps_resolved?.['argument.voices'] as ArgumentVoicesData | undefined;
      secs.push({ title: piece.instanceLabel ?? piece.instanceId ?? '', voices: voices ?? null });
    }
    secs.sort(
      (a, b) =>
        (orderByTitle.get(a.title) ?? Number.MAX_SAFE_INTEGER) -
        (orderByTitle.get(b.title) ?? Number.MAX_SAFE_INTEGER),
    );
    return buildDafVoiceGraph(secs, classify);
  });

  const title = () =>
    lang() === 'he' ? dafRefHe(ref().tractate, ref().page) : `${ref().tractate} ${ref().page}`;
  const backHref = () =>
    `?tractate=${encodeURIComponent(ref().tractate)}&page=${encodeURIComponent(ref().page)}#daf`;

  const genLabel = (p: { collective: boolean; generation?: string }): string => {
    if (p.collective) return t('dafvoices.collective');
    if (!p.generation) return '';
    return GENERATION_BY_ID[p.generation as keyof typeof GENERATION_BY_ID]?.label ?? '';
  };
  const personDot = (p: { collective: boolean; generation?: string }) =>
    p.collective ? '#b8b2a4' : colorForGeneration(p.generation);

  const loading = () => payload.loading || spines.loading;

  const stmtNum = (sec: SpineSection, id: string) =>
    sec.spine.nodes.findIndex((nd) => nd.id === id) + 1;

  // Chips for one statement row: its outgoing non-`continues` links (the
  // vertical order already conveys continuation).
  const rowLinks = (sec: SpineSection, node: StatementNode): StatementLink[] =>
    sec.spine.links.filter((l) => l.from === node.id && l.relation !== 'continues');

  const chipBase: JSX.CSSProperties = {
    display: 'inline-flex',
    'align-items': 'center',
    gap: '0.25rem',
    padding: '0.08rem 0.45rem',
    'border-radius': '999px',
    background: '#fff',
    'font-size': '0.7rem',
    cursor: 'pointer',
  };

  return (
    <main class="page-shell" style={{ '--page-max': '940px', color: '#222' }}>
      <header style={{ 'margin-bottom': '1.1rem' }}>
        <a
          href={backHref()}
          style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}
        >
          ← {t('arggraph.back')}
        </a>
        <h1 style={{ margin: '0.4rem 0 0', 'font-size': '1.45rem' }}>
          {t('arggraph.title')} · <span style={{ color: '#8a2a2b' }}>{title()}</span>
        </h1>
        <p
          style={{ margin: '0.3rem 0 0', color: '#666', 'font-size': '0.9rem', 'line-height': 1.5 }}
        >
          {t('arggraph.subtitle')}
        </p>
      </header>

      <Show when={!loading()} fallback={<p style={{ color: '#888' }}>{t('arggraph.loading')}</p>}>
        <Show
          when={sections().length > 0}
          fallback={
            <div
              style={{
                border: CARD_BORDER,
                'border-radius': '8px',
                background: '#faf8f3',
                padding: '1rem 1.1rem',
                color: '#6b6661',
                'line-height': 1.55,
              }}
            >
              <p style={{ margin: 0 }}>{t('arggraph.empty')}</p>
              <a
                href={backHref()}
                style={{ color: '#8a2a2b', 'font-size': '0.85rem', 'text-decoration': 'none' }}
              >
                {t('arggraph.openDaf')} →
              </a>
            </div>
          }
        >
          {/* Cold banner: sections exist but the statement extraction hasn't run. */}
          <Show when={!spines()?.movesComputed}>
            <div
              style={{
                border: '1px solid #e7ddc6',
                'border-radius': '8px',
                background: '#fbf6e9',
                padding: '0.55rem 0.85rem',
                color: '#8a6d3b',
                'font-size': '0.82rem',
                'margin-bottom': '0.9rem',
              }}
            >
              {t('arggraph.cold')}
            </div>
          </Show>

          {/* Who speaks: prominence-ordered people strip; click to focus. */}
          <Show when={people().length > 0}>
            <section style={{ 'margin-bottom': '1.1rem' }}>
              <h2 style={{ 'font-size': '0.95rem', color: '#444', margin: '0 0 0.5rem' }}>
                {t('arggraph.people')}
              </h2>
              <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem 0.4rem' }}>
                <For each={people()}>
                  {(p) => (
                    <button
                      type="button"
                      onClick={() => toggleFocus(p.name)}
                      style={{
                        ...chipBase,
                        font: 'inherit',
                        'font-size': '0.78rem',
                        color: '#333',
                        border: focus() === p.name ? '1px solid #8a2a2b' : '1px solid #e4e0d4',
                        background: focus() === p.name ? '#fdf2f2' : '#fafafa',
                        'font-style': p.collective ? 'italic' : 'normal',
                      }}
                    >
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          'border-radius': '999px',
                          background: personDot(p),
                          display: 'inline-block',
                          'flex-shrink': 0,
                        }}
                      />
                      {p.name}
                      <span style={{ color: '#999', 'font-size': '0.68rem' }}>
                        {p.statementCount}
                      </span>
                    </button>
                  )}
                </For>
              </div>
              <Show when={focusedPerson()}>
                {(p) => (
                  <p
                    style={{
                      margin: '0.5rem 0 0',
                      'font-size': '0.8rem',
                      color: '#6b6661',
                      display: 'flex',
                      'align-items': 'center',
                      gap: '0.5rem',
                      'flex-wrap': 'wrap',
                    }}
                  >
                    <strong style={{ color: '#2a2520' }}>{p().name}</strong>
                    <Show when={genLabel(p())}>
                      <span>{genLabel(p())}</span>
                    </Show>
                    <span>
                      {p().statementCount}{' '}
                      {p().statementCount === 1
                        ? t('arggraph.statement')
                        : t('arggraph.statements')}{' '}
                      · {p().sections.length}{' '}
                      {p().sections.length === 1 ? t('arggraph.section') : t('arggraph.sections')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFocus(null)}
                      style={{
                        font: 'inherit',
                        'font-size': '0.75rem',
                        color: '#8a2a2b',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        'text-decoration': 'underline',
                        'text-underline-offset': '2px',
                      }}
                    >
                      {t('arggraph.clearFocus')}
                    </button>
                  </p>
                )}
              </Show>
            </section>
          </Show>

          {/* The sections, in daf order — the argument walk. */}
          <For each={sections()}>
            {(sec) => {
              const outgoing = () => connections().filter((c) => c.from === sec.index);
              const incoming = () => connections().filter((c) => c.to === sec.index);
              const secId = `arg-sec-${sec.index}`;
              return (
                <article
                  id={secId}
                  style={{
                    border: CARD_BORDER,
                    'border-radius': '10px',
                    background: '#fff',
                    padding: '0.75rem 0.95rem',
                    'margin-bottom': '0.8rem',
                    opacity: sectionOpacity(sec),
                    transition: 'opacity 0.15s ease',
                    ...flashStyle(secId),
                  }}
                >
                  <header
                    style={{
                      display: 'flex',
                      'align-items': 'baseline',
                      gap: '0.55rem',
                      'flex-wrap': 'wrap',
                      'margin-bottom': sec.spine.nodes.length > 0 ? '0.6rem' : 0,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        'align-items': 'center',
                        'justify-content': 'center',
                        width: '22px',
                        height: '22px',
                        'border-radius': '999px',
                        background: '#f6f2e9',
                        border: '1px solid #e4dcc8',
                        color: '#8a2a2b',
                        'font-size': '0.75rem',
                        'font-weight': 700,
                        'flex-shrink': 0,
                        'align-self': 'center',
                      }}
                    >
                      {sec.index + 1}
                    </span>
                    {/* Section titles / statement texts are stored English —
                        dir=auto keeps them readable inside the RTL chrome. */}
                    <h3 dir="auto" style={{ margin: 0, 'font-size': '0.95rem', color: '#2a2520' }}>
                      {sec.title}
                    </h3>
                    <Show when={sec.spine.dispute}>
                      <span
                        style={{
                          'font-size': '0.62rem',
                          'text-transform': 'uppercase',
                          'letter-spacing': '0.06em',
                          padding: '0.08rem 0.4rem',
                          'border-radius': '999px',
                          color: '#b91c1c',
                          background: '#fde8e8',
                          border: '1px solid #f3c9c9',
                        }}
                      >
                        {t('arggraph.dispute')}
                      </span>
                    </Show>
                    {/* Cross-section connections, as labeled chips instead of
                        unlabeled curves: outgoing solid, incoming faint. */}
                    <span
                      style={{
                        display: 'inline-flex',
                        'flex-wrap': 'wrap',
                        gap: '0.25rem',
                        'margin-inline-start': 'auto',
                      }}
                    >
                      <For each={outgoing()}>
                        {(c) => (
                          <button
                            type="button"
                            onClick={() => flashEl(`arg-sec-${c.to}`, 'start')}
                            title={c.derived ? t('arggraph.derived') : undefined}
                            style={{
                              ...chipBase,
                              font: 'inherit',
                              color: KIND_COLOR[c.kind],
                              border: `1px ${c.derived || KIND_DASH[c.kind] ? 'dashed' : 'solid'} ${KIND_COLOR[c.kind]}`,
                            }}
                          >
                            {t(`link.rel.${c.kind}`)} →{' '}
                            <strong style={{ 'font-weight': 700 }}>§{c.to + 1}</strong>
                          </button>
                        )}
                      </For>
                      <For each={incoming()}>
                        {(c) => (
                          <button
                            type="button"
                            onClick={() => flashEl(`arg-sec-${c.from}`, 'start')}
                            title={c.derived ? t('arggraph.derived') : undefined}
                            style={{
                              ...chipBase,
                              font: 'inherit',
                              color: '#8a857c',
                              border: '1px solid #e4e0d4',
                              background: '#fafafa',
                            }}
                          >
                            ← <strong style={{ 'font-weight': 700 }}>§{c.from + 1}</strong>{' '}
                            {t(`link.rel.${c.kind}`)}
                          </button>
                        )}
                      </For>
                    </span>
                  </header>

                  <Show
                    when={sec.spine.nodes.length > 0}
                    fallback={
                      <Show when={spines()?.movesComputed}>
                        <p
                          style={{
                            margin: '0.4rem 0 0',
                            color: '#999',
                            'font-style': 'italic',
                            'font-size': '0.8rem',
                          }}
                        >
                          {t('arggraph.section.none')}
                        </p>
                      </Show>
                    }
                  >
                    <For each={sec.spine.nodes}>
                      {(node, ni) => {
                        const accent = () =>
                          (sec.spine.dispute ? sideTint(node.side) : undefined) ??
                          roleColor(node.role);
                        const rowId = `arg-stmt-${sec.index}-${node.id}`;
                        return (
                          <div
                            id={rowId}
                            style={{
                              'border-inline-start': `3px solid ${accent()}`,
                              padding: '0.35rem 0.6rem',
                              margin: ni() === 0 ? '0 0 0.35rem' : '0.35rem 0',
                              background: '#fafafa',
                              'border-radius': '0 5px 5px 0',
                              opacity: rowOpacity(sec, node),
                              transition: 'opacity 0.15s ease',
                              ...flashStyle(rowId),
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                'align-items': 'center',
                                gap: '0.45rem',
                                'flex-wrap': 'wrap',
                              }}
                            >
                              <span style={{ 'font-size': '0.66rem', color: '#b8b2a4' }}>
                                {ni() + 1}
                              </span>
                              <span
                                style={{
                                  'font-size': '0.62rem',
                                  'font-weight': 700,
                                  'text-transform': 'uppercase',
                                  'letter-spacing': '0.05em',
                                  color: roleColor(node.role),
                                }}
                              >
                                {node.role}
                              </span>
                              {/* Named voices as clickable person chips; the
                                  descriptive speaker label stays as muted text
                                  for anonymous moves ("Gemara's question"). */}
                              <Show
                                when={(node.rabbiNames ?? []).length > 0}
                                fallback={
                                  <Show when={node.speaker}>
                                    <span
                                      style={{
                                        'font-size': '0.75rem',
                                        color: '#8a857c',
                                        'font-style': 'italic',
                                      }}
                                    >
                                      {node.speaker}
                                    </span>
                                  </Show>
                                }
                              >
                                <For each={node.rabbiNames}>
                                  {(name) => {
                                    const cls = () => classify(name);
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => toggleFocus(name)}
                                        style={{
                                          font: 'inherit',
                                          display: 'inline-flex',
                                          'align-items': 'center',
                                          gap: '0.3rem',
                                          'font-size': '0.78rem',
                                          'font-weight': 600,
                                          color: '#333',
                                          background: 'none',
                                          border: 'none',
                                          padding: 0,
                                          cursor: 'pointer',
                                          'font-style': cls().collective ? 'italic' : 'normal',
                                        }}
                                      >
                                        <span
                                          style={{
                                            width: '8px',
                                            height: '8px',
                                            'border-radius': '999px',
                                            background: personDot(cls()),
                                            display: 'inline-block',
                                            'flex-shrink': 0,
                                          }}
                                        />
                                        {name}
                                      </button>
                                    );
                                  }}
                                </For>
                              </Show>
                              <Show when={sec.spine.dispute && node.side}>
                                <span
                                  style={{
                                    'font-size': '0.6rem',
                                    padding: '0.05rem 0.35rem',
                                    'border-radius': '3px',
                                    color: '#fff',
                                    background: sideTint(node.side) ?? '#888',
                                  }}
                                >
                                  {node.side}
                                </span>
                              </Show>
                              <span style={{ flex: 1 }} />
                              <For each={rowLinks(sec, node)}>
                                {(l) => (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      flashEl(`arg-stmt-${sec.index}-${l.to}`, 'center')
                                    }
                                    title={
                                      l.source === 'voices'
                                        ? t('arggraph.linkFromVoices')
                                        : t('arggraph.linkFromRoles')
                                    }
                                    style={{
                                      ...chipBase,
                                      font: 'inherit',
                                      'font-size': '0.66rem',
                                      color: relationColor(l.relation),
                                      border: `1px solid ${relationColor(l.relation)}`,
                                    }}
                                  >
                                    {l.relation === 'opposes' ? '⇄' : '→'}{' '}
                                    {relationLabel(l.relation)}{' '}
                                    <strong style={{ 'font-weight': 700 }}>
                                      {stmtNum(sec, l.to)}
                                    </strong>
                                  </button>
                                )}
                              </For>
                            </div>
                            <Show when={node.summary}>
                              <div
                                dir="auto"
                                style={{
                                  color: '#555',
                                  'font-size': '0.82rem',
                                  'margin-top': '0.15rem',
                                  'line-height': 1.45,
                                }}
                              >
                                {node.summary}
                              </div>
                            </Show>
                            <Show when={!node.summary && node.excerpt}>
                              <div
                                dir="rtl"
                                lang="he"
                                style={{
                                  'font-family': '"Mekorot Vilna", serif',
                                  'font-size': '0.95rem',
                                  color: '#333',
                                  'margin-top': '0.15rem',
                                }}
                              >
                                {node.excerpt}…
                              </div>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </Show>
                </article>
              );
            }}
          </For>

          {/* The old daf-wide voice network, kept as a collapsed aggregate view. */}
          <Show when={network().nodes.length > 0}>
            <details style={{ 'margin-top': '1.4rem' }}>
              <summary
                style={{
                  cursor: 'pointer',
                  'font-size': '0.9rem',
                  color: '#444',
                  'font-weight': 600,
                }}
              >
                {t('arggraph.network')}
              </summary>
              <div style={{ 'margin-top': '0.7rem' }}>
                <DafVoiceGraph nodes={network().nodes} edges={network().edges} />
              </div>
            </details>
          </Show>
        </Show>
      </Show>
    </main>
  );
}
