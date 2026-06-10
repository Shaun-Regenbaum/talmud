/**
 * Lineage tree for a rabbi — generation-banded graph view.
 *
 * Renders a small SVG-based graph: subject node at the center, teachers
 * above (placed in their generation rows), students below (placed in their
 * generation rows), debate partners in the subject's row offset to the
 * right, family on the subject's row (and revealed under "show all").
 * Edges: solid lines for teacher↔student, dashed for debate partners.
 * Each node is color-coded by the generation it belongs to (sharing the
 * palette used by the daf-render gen underlines + the legend), with a
 * vertical generation axis on the left labeling the bands.
 *
 * Items the daf actually references (via `rabbi.relationships.evidence`)
 * get a soft yellow highlight + a click handler that paints the relevant
 * Hebrew/Aramaic span on the daf via onHighlightRange.
 */

import { createSignal, For, type JSX, Show } from 'solid-js';
import { type EdgeRect, orthogonalEdgePath } from './flow/orthogonalEdge';
import {
  GENERATION_BY_ID,
  GENERATION_IDS,
  type GenerationId,
  generationLabelHe,
} from './generations';
import { lang, t } from './i18n';

/** Generation label in the active language. */
function genLabel(id: GenerationId): string {
  const info = GENERATION_BY_ID[id];
  if (!info) return id;
  return lang() === 'he' ? generationLabelHe(info) : info.label;
}

export interface RelationshipPerson {
  name: string;
  primary?: boolean;
  note?: string;
}

export interface DebatePartner {
  name: string;
  note?: string;
}

export interface FamilyMember {
  name: string;
  relation: string;
}

export interface RelationshipsData {
  teachers: RelationshipPerson[];
  students: RelationshipPerson[];
  debatePartners: DebatePartner[];
  family: FamilyMember[];
  prose?: string;
}

export interface RelationshipsEvidence {
  kind: 'teacher' | 'student' | 'partner' | 'family';
  name: string;
  excerpt: string;
  note: string;
  startSegIdx?: number;
  endSegIdx?: number;
  tokenStart?: number;
  tokenEnd?: number;
}

interface Props {
  subjectName: string;
  /** Subject's generation — used to anchor the timeline. Pull from the mark
   *  instance's generation field, NOT from generationByName (which keys by
   *  name and may be ambiguous for shared names). */
  subjectGeneration: GenerationId;
  data: RelationshipsData;
  evidence: RelationshipsEvidence[];
  /** Name → GenerationId map, used to place each named person on its
   *  generation row. When the name is unknown to the map, we fall back to
   *  a sensible default based on relationship role (teacher = one earlier,
   *  student = one later, partner = same, family = derived from relation). */
  generationByName: Map<string, GenerationId>;
  onHighlightRange?: (
    range: {
      start: number;
      end: number;
      key: string;
      tokenStart?: number;
      tokenEnd?: number;
    } | null,
  ) => void;
}

// Layout constants. The SVG width is fixed (~620px to fit a 640px sidebar
// with small horizontal padding); height is computed from the number of
// generation rows the visible set spans.
const AXIS_WIDTH = 96; // generation labels column
const NODE_W = 152;
const NODE_H = 40;
const ROW_H = 82;
const COL_GAP = 22;
const NODE_GAP = 12; // gap between adjacent nodes in the same row
const TOP_PADDING = 20;
const BOTTOM_PADDING = 22;
/** Max character count we'll let render before truncating with ellipsis.
 *  Calibrated against NODE_W=152 + font-size=11 + horizontal padding. */
const NAME_MAX_CHARS = 22;
/** Subject node uses font-size=13 (larger), so fewer chars fit in NODE_W. */
const SUBJECT_NAME_MAX_CHARS = 21;

const EVIDENCE_BG = '#fef3c7';
const EVIDENCE_BORDER = '#eab308';
const PRIMARY_COLOR = '#8a2a2b';

type Role = 'subject' | 'teacher' | 'student' | 'partner' | 'family';

interface LaidNode {
  key: string;
  name: string;
  role: Role;
  generationId: GenerationId;
  primary: boolean;
  familyRelation?: string;
  /** x, y refer to the node's TOP-LEFT corner in SVG coords. */
  x: number;
  y: number;
}

interface LaidEdge {
  from: LaidNode;
  to: LaidNode;
  kind: 'parent' | 'partner';
}

/** Generation index in GENERATIONS order. Smaller index = earlier era. */
function genIndex(id: GenerationId): number {
  const i = GENERATION_IDS.indexOf(id);
  return i < 0 ? GENERATION_IDS.indexOf('unknown') : i;
}

function compactifyHonorifics(name: string): string {
  return name
    .replace(/^Rabbi\s+/, 'R. ')
    .replace(/^Rabban\s+/, 'Rb. ')
    .replace(/^Rav\s+/, 'R. ')
    .replace(/\s+bar\s+/g, ' b. ')
    .replace(/\s+ben\s+/g, ' b. ');
}

/** Compact a rabbi's display name so it fits in a node card: shorten
 *  "Rabbi" → "R.", "Rav" → "R.", "Rabban" → "Rb.", "Mar" stays, plus
 *  "bar" / "ben" → "b.". Truncates with ellipsis if still over NAME_MAX_CHARS.
 *  Used for non-subject node labels — these always compact, even short
 *  names, so the row reads as a consistent abbreviated set. */
function compactRabbiName(name: string): string {
  const compact = compactifyHonorifics(name);
  if (compact.length <= NAME_MAX_CHARS) return compact;
  return `${compact.slice(0, NAME_MAX_CHARS - 1)}…`;
}

/** Fit the subject's display name to the node card. Prefer the full form
 *  (subject is the focal node), falling back to honorific compaction and
 *  finally ellipsis only when the name still overflows. */
function fitSubjectName(name: string): string {
  if (name.length <= SUBJECT_NAME_MAX_CHARS) return name;
  const compact = compactifyHonorifics(name);
  if (compact.length <= SUBJECT_NAME_MAX_CHARS) return compact;
  return `${compact.slice(0, SUBJECT_NAME_MAX_CHARS - 1)}…`;
}

/** Map a family relation string to a coarse generation offset relative to
 *  the subject. Used only when generationByName misses. */
function familyGenerationOffset(relation: string): number {
  const r = relation.toLowerCase();
  if (/father|mother|grandfather|grandmother|uncle|aunt/.test(r)) return -1;
  if (/son|daughter|grandson|granddaughter|nephew|niece/.test(r)) return +1;
  return 0; // brother / sister / cousin / spouse / brother-in-law → same row
}

/** Compute placement for every visible person + return canvas dimensions. */
function buildLayout(
  subjectName: string,
  subjectGen: GenerationId,
  data: RelationshipsData,
  generationByName: Map<string, GenerationId>,
  expanded: boolean,
): { nodes: LaidNode[]; edges: LaidEdge[]; width: number; height: number } {
  // Resolve each visible person's generation. Build rows[ genIdx ] = LaidNode[].
  const visibleTeachers = expanded ? data.teachers : data.teachers.filter((t) => t.primary);
  const visibleStudents = expanded ? data.students : data.students.filter((t) => t.primary);
  // Debate partners: when collapsed, show only the first 2 (canonical
  // pairings — e.g. for Abaye that's Rava). Graph data doesn't carry a
  // primary flag on colleagues, so we use insertion order. Expanded view
  // reveals the rest.
  const visiblePartners = expanded ? data.debatePartners : data.debatePartners.slice(0, 2);
  const visibleFamily = expanded ? data.family : [];

  const subjectIdx = genIndex(subjectGen);

  // Gather all (person, role, genIdx, ...) tuples — we'll bucket by genIdx
  // and lay them out left-to-right.
  interface PreNode {
    key: string;
    name: string;
    role: Role;
    genIdx: number;
    generationId: GenerationId;
    primary: boolean;
    familyRelation?: string;
  }
  const pre: PreNode[] = [];

  pre.push({
    key: `subject:${subjectName}`,
    name: subjectName,
    role: 'subject',
    genIdx: subjectIdx,
    generationId: subjectGen,
    primary: true,
  });

  for (const t of visibleTeachers) {
    const id = generationByName.get(t.name);
    const genIdx = id ? genIndex(id) : Math.max(0, subjectIdx - 1);
    pre.push({
      key: `teacher:${t.name}`,
      name: t.name,
      role: 'teacher',
      genIdx,
      generationId: GENERATION_IDS[genIdx] ?? 'unknown',
      primary: !!t.primary,
    });
  }

  for (const s of visibleStudents) {
    const id = generationByName.get(s.name);
    const genIdx = id ? genIndex(id) : Math.min(GENERATION_IDS.length - 1, subjectIdx + 1);
    pre.push({
      key: `student:${s.name}`,
      name: s.name,
      role: 'student',
      genIdx,
      generationId: GENERATION_IDS[genIdx] ?? 'unknown',
      primary: !!s.primary,
    });
  }

  for (const p of visiblePartners) {
    const id = generationByName.get(p.name);
    const genIdx = id ? genIndex(id) : subjectIdx;
    pre.push({
      key: `partner:${p.name}`,
      name: p.name,
      role: 'partner',
      genIdx,
      generationId: GENERATION_IDS[genIdx] ?? 'unknown',
      primary: false,
    });
  }

  for (const f of visibleFamily) {
    const id = generationByName.get(f.name);
    const fallbackOffset = familyGenerationOffset(f.relation);
    const genIdx = id
      ? genIndex(id)
      : Math.max(0, Math.min(GENERATION_IDS.length - 1, subjectIdx + fallbackOffset));
    pre.push({
      key: `family:${f.name}`,
      name: f.name,
      role: 'family',
      genIdx,
      generationId: GENERATION_IDS[genIdx] ?? 'unknown',
      primary: false,
      familyRelation: f.relation,
    });
  }

  // Bucket by genIdx for row layout. Sort rows by index ascending (earliest
  // generation = top).
  const byRow = new Map<number, PreNode[]>();
  for (const n of pre) {
    const list = byRow.get(n.genIdx) ?? [];
    list.push(n);
    byRow.set(n.genIdx, list);
  }
  const rowIndices = Array.from(byRow.keys()).sort((a, b) => a - b);

  // Within each row, order is left-anchored:
  //   - Subject ALWAYS goes in column 0 (the leftmost X position of the
  //     drawing area) so the subject sits in a fixed vertical "spine" with
  //     teachers above and students below in the same column.
  //   - Within a row of teachers/students/family (no subject), primary
  //     entries lead, then non-primary alphabetical.
  //   - In the subject's row, partners trail to the right of subject in
  //     graph-order (which the rabbi-graph helper preserves; primary=true
  //     entries surface first).
  for (const idx of rowIndices) {
    const list = byRow.get(idx)!;
    list.sort((a, b) => {
      // Subject is always first.
      if (a.role === 'subject' && b.role !== 'subject') return -1;
      if (b.role === 'subject' && a.role !== 'subject') return 1;
      // Primary first within same row.
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  // Y per row (earliest generation = top).
  const rowToY = new Map<number, number>();
  rowIndices.forEach((idx, i) => {
    rowToY.set(idx, TOP_PADDING + i * ROW_H);
  });
  const height = TOP_PADDING + rowIndices.length * ROW_H + BOTTOM_PADDING;

  // X layout: every row starts at SUBJECT_X (immediately right of the axis
  // column). Nodes extend rightward. The subject sits in column 0, and the
  // FIRST teacher in the teachers row + FIRST student in the students row
  // also sit in column 0 — giving the visual "spine" of primary-teacher →
  // subject → primary-student that the mockup asks for. Partners trail the
  // subject in subject's row.
  const SUBJECT_X = AXIS_WIDTH + COL_GAP;
  const COL_STEP = NODE_W + NODE_GAP;

  let widestRow = 1;
  const nodes: LaidNode[] = [];
  for (const idx of rowIndices) {
    const list = byRow.get(idx)!;
    widestRow = Math.max(widestRow, list.length);
    const y = rowToY.get(idx)!;
    list.forEach((n, j) => {
      const x = SUBJECT_X + j * COL_STEP;
      nodes.push({
        key: n.key,
        name: n.name,
        role: n.role,
        generationId: n.generationId,
        primary: n.primary,
        familyRelation: n.familyRelation,
        x,
        y,
      });
    });
  }
  const drawWidth = widestRow * NODE_W + (widestRow - 1) * NODE_GAP;
  const width = SUBJECT_X + drawWidth + 16;

  // Edges: subject → each teacher (solid, up), subject → each student
  // (solid, down), subject ↔ each partner (dashed). Family is rendered as
  // a node but not edge-connected — relation label sits on the node.
  const subject = nodes.find((n) => n.role === 'subject');
  const edges: LaidEdge[] = [];
  if (subject) {
    for (const n of nodes) {
      if (n.role === 'teacher' || n.role === 'student') {
        edges.push({ from: subject, to: n, kind: 'parent' });
      } else if (n.role === 'partner') {
        edges.push({ from: subject, to: n, kind: 'partner' });
      }
    }
  }

  return { nodes, edges, width, height };
}

function rect(n: LaidNode): EdgeRect {
  return { x: n.x, y: n.y, w: NODE_W, h: NODE_H };
}

/** Parent edge (teacher↔student) — delegated to the shared orthogonal router
 *  so it is always a clean vertical drop or L-shape, never diagonal. */
function parentPath(from: LaidNode, to: LaidNode): string {
  return orthogonalEdgePath(rect(from), rect(to));
}

/** Partner edge — same orthogonal router. When the partner sits in the
 *  subject's row this is a horizontal line; off-row it routes as an L-shape
 *  rather than the diagonal the old single-segment version drew. */
function partnerPath(from: LaidNode, to: LaidNode): string {
  return orthogonalEdgePath(rect(from), rect(to));
}

export default function RabbiLineageTree(props: Props): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);
  const [activeEvidenceKey, setActiveEvidenceKey] = createSignal<string | null>(null);

  const evidenceByPerson = (): Map<string, RelationshipsEvidence> => {
    const m = new Map<string, RelationshipsEvidence>();
    for (const e of props.evidence) {
      const k = `${e.kind}:${e.name}`;
      if (!m.has(k)) m.set(k, e);
    }
    return m;
  };

  const layout = () =>
    buildLayout(
      props.subjectName,
      props.subjectGeneration,
      props.data,
      props.generationByName,
      expanded(),
    );

  const hasOverflow = () =>
    props.data.teachers.some((t) => !t.primary) ||
    props.data.students.some((t) => !t.primary) ||
    props.data.debatePartners.length > 2 ||
    props.data.family.length > 0;

  // Map role → evidence kind for evidence lookup.
  const roleToEvidenceKind: Record<Role, RelationshipsEvidence['kind'] | null> = {
    subject: null,
    teacher: 'teacher',
    student: 'student',
    partner: 'partner',
    family: 'family',
  };

  const evidenceFor = (n: LaidNode): RelationshipsEvidence | undefined => {
    const kind = roleToEvidenceKind[n.role];
    if (!kind) return undefined;
    return evidenceByPerson().get(`${kind}:${n.name}`);
  };

  const clickNode = (n: LaidNode) => {
    const ev = evidenceFor(n);
    if (!ev || typeof ev.startSegIdx !== 'number' || typeof ev.endSegIdx !== 'number') return;
    const key = `rabbi-evidence:${n.role}:${n.name}:${ev.startSegIdx}:${ev.tokenStart ?? 0}`;
    if (activeEvidenceKey() === key) {
      setActiveEvidenceKey(null);
      props.onHighlightRange?.(null);
    } else {
      setActiveEvidenceKey(key);
      props.onHighlightRange?.({
        start: ev.startSegIdx,
        end: ev.endSegIdx,
        key,
        tokenStart: ev.tokenStart,
        tokenEnd: ev.tokenEnd,
      });
    }
  };

  // Compute which generations to label on the axis: every generation row
  // we placed a node in, plus the band markers next to it.
  const axisRows = () => {
    const rows = new Map<number, { y: number; label: string; color: string }>();
    for (const n of layout().nodes) {
      const gen = GENERATION_BY_ID[n.generationId];
      const idx = GENERATION_IDS.indexOf(n.generationId);
      if (!rows.has(idx)) {
        rows.set(idx, {
          y: n.y + NODE_H / 2,
          label: genLabel(n.generationId),
          color: gen?.color ?? '#999',
        });
      }
    }
    return Array.from(rows.entries())
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v);
  };

  return (
    <div
      style={{
        border: '1px solid #eae8e0',
        'border-radius': '6px',
        background: '#fafaf7',
        padding: '0.7rem 0.85rem',
        'margin-top': '0.9rem',
      }}
    >
      <div
        style={{
          'font-size': '0.7rem',
          'text-transform': 'uppercase',
          'letter-spacing': '0.08em',
          color: '#888',
          'margin-bottom': '0.5rem',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
        }}
      >
        <span>{t('rabbi.lineage.title')}</span>
        <Show when={hasOverflow()}>
          <button
            type="button"
            onClick={() => setExpanded(!expanded())}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: '#666',
              cursor: 'pointer',
              'font-size': '0.65rem',
              'font-family': 'inherit',
              'text-transform': 'uppercase',
              'letter-spacing': '0.06em',
            }}
          >
            {expanded() ? t('common.collapse') : t('common.showAll')}
          </button>
        </Show>
      </div>

      {/* Pannable canvas: when the tree is wider/taller than the sidebar
          slot, scroll in both axes. SVG renders at natural size — no
          max-width:100% which would scale-fit and crush the layout.
          min-width:0 lets the wrapper shrink inside flex parents. */}
      <div
        style={{
          width: '100%',
          'min-width': 0,
          'max-height': '480px',
          'overflow-x': 'auto',
          'overflow-y': 'auto',
          // Inherently LTR diagram — pin scroll direction so the page-level
          // dir=rtl (Hebrew) doesn't push the right-hand generations off-screen.
          direction: 'ltr',
          border: '1px solid #f0eee6',
          'border-radius': '4px',
          background: '#fff',
        }}
      >
        <svg
          role="img"
          aria-label="Rabbi lineage tree by generation"
          width={layout().width}
          height={layout().height}
          viewBox={`0 0 ${layout().width} ${layout().height}`}
          style={{ display: 'block' }}
        >
          {/* Generation axis: vertical column on the left with horizontal
              divider lines + small color swatch + generation label. */}
          <For each={axisRows()}>
            {(row) => (
              <>
                <line
                  x1={AXIS_WIDTH - 2}
                  y1={row.y}
                  x2={AXIS_WIDTH + 6}
                  y2={row.y}
                  stroke="#999"
                  stroke-width={1.5}
                />
                <circle
                  cx={AXIS_WIDTH - 10}
                  cy={row.y}
                  r={4}
                  fill={row.color}
                  stroke="#fff"
                  stroke-width={1}
                />
                <text
                  x={AXIS_WIDTH - 18}
                  y={row.y + 4}
                  text-anchor="end"
                  font-size="10"
                  font-family="system-ui, -apple-system, sans-serif"
                  fill="#555"
                >
                  {row.label}
                </text>
              </>
            )}
          </For>

          {/* Vertical timeline spine */}
          <line
            x1={AXIS_WIDTH - 2}
            y1={TOP_PADDING - 4}
            x2={AXIS_WIDTH - 2}
            y2={layout().height - BOTTOM_PADDING + 4}
            stroke="#d4d4d4"
            stroke-width={1}
          />

          {/* Edges: solid for parent (teacher→student), dashed for partner.
              Drawn before nodes so nodes paint over the line ends. */}
          <For each={layout().edges}>
            {(e) => (
              <path
                d={e.kind === 'parent' ? parentPath(e.from, e.to) : partnerPath(e.from, e.to)}
                fill="none"
                stroke={e.kind === 'parent' ? '#666' : '#999'}
                stroke-width={1.5}
                stroke-dasharray={e.kind === 'partner' ? '4 3' : undefined}
              />
            )}
          </For>

          {/* Nodes */}
          <For each={layout().nodes}>
            {(n) => {
              const gen = GENERATION_BY_ID[n.generationId];
              const ev = evidenceFor(n);
              const hasEv = !!ev;
              const isActive =
                activeEvidenceKey() ===
                (ev
                  ? `rabbi-evidence:${n.role}:${n.name}:${ev.startSegIdx}:${ev.tokenStart ?? 0}`
                  : '');
              const borderColor = isActive ? EVIDENCE_BORDER : (gen?.color ?? '#999');
              const bgColor = isActive
                ? EVIDENCE_BG
                : hasEv
                  ? '#fefce8'
                  : n.role === 'subject'
                    ? '#fff'
                    : '#fff';
              const labelColor = n.role === 'subject' ? PRIMARY_COLOR : '#222';
              const borderWidth = n.role === 'subject' ? 2 : n.primary ? 1.75 : 1.25;

              const activate = () => hasEv && clickNode(n);
              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: role="button"/tabindex ARE set when the node has on-daf evidence; Biome cannot resolve the conditional role expression
                <g
                  role={hasEv ? 'button' : undefined}
                  tabindex={hasEv ? 0 : undefined}
                  style={{ cursor: hasEv ? 'pointer' : 'default' }}
                  onClick={activate}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      activate();
                    }
                  }}
                >
                  <title>
                    {ev
                      ? `${n.name}\n${t('rabbi.onThisDaf', { text: ev.note || ev.excerpt })}`
                      : `${n.name}${n.familyRelation ? ` — ${n.familyRelation}` : ''}${gen ? ` · ${genLabel(n.generationId)}` : ''}`}
                  </title>
                  <rect
                    x={n.x}
                    y={n.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={6}
                    ry={6}
                    fill={bgColor}
                    stroke={borderColor}
                    stroke-width={borderWidth}
                  />
                  {/* Generation color stripe on the left edge of each node */}
                  <rect
                    x={n.x}
                    y={n.y}
                    width={4}
                    height={NODE_H}
                    rx={2}
                    ry={2}
                    fill={gen?.color ?? '#999'}
                  />
                  {/* Family relation tag (small, above name) */}
                  <Show when={n.familyRelation}>
                    <text
                      x={n.x + NODE_W / 2}
                      y={n.y + 11}
                      text-anchor="middle"
                      font-size="8"
                      font-family="system-ui, -apple-system, sans-serif"
                      fill="#888"
                    >
                      {n.familyRelation}
                    </text>
                  </Show>
                  {/* Person name. Subject prefers full form but falls back to
                    compaction/ellipsis when too long; other nodes always get
                    "Rabbi" → "R." compaction + ellipsis truncation so long
                    names like "Rabbi Shimon bar Yochai" don't overflow
                    the card. Full name is in the <title> tooltip. */}
                  <text
                    x={n.x + NODE_W / 2}
                    y={n.familyRelation ? n.y + 26 : n.y + 23}
                    text-anchor="middle"
                    font-size={n.role === 'subject' ? '13' : '11'}
                    font-weight={n.role === 'subject' || n.primary ? 600 : 500}
                    font-family="system-ui, -apple-system, sans-serif"
                    fill={labelColor}
                  >
                    {n.role === 'subject' ? fitSubjectName(n.name) : compactRabbiName(n.name)}
                  </text>
                  {/* Evidence dot in the top-right corner */}
                  <Show when={hasEv}>
                    <circle cx={n.x + NODE_W - 6} cy={n.y + 6} r={3.5} fill={EVIDENCE_BORDER} />
                  </Show>
                </g>
              );
            }}
          </For>
        </svg>
      </div>

      <Show when={props.data.debatePartners.length > 0}>
        <div
          style={{
            'font-size': '0.65rem',
            color: '#999',
            'text-transform': 'uppercase',
            'letter-spacing': '0.06em',
            'margin-top': '0.5rem',
            display: 'flex',
            'align-items': 'center',
            gap: '0.5rem',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '12px',
              height: '1.5px',
              'border-top': '1.5px dashed #999',
            }}
          />
          <span>{t('rabbi.lineage.debatePartners')}</span>
        </div>
      </Show>
    </div>
  );
}
