/**
 * Lineage tree for a rabbi. Renders the subject at center with primary
 * teacher(s) above and primary student(s) below; "Show all" expands the
 * full list of teachers + students. Debate partners are rendered as a
 * side-row of chips.
 *
 * Items that this daf actually references (via `rabbi.relationships.evidence`)
 * get a soft highlight and a click handler that paints the relevant
 * Hebrew/Aramaic span on the daf — same `onHighlightRange` plumbing the
 * argument-move cards use.
 */

import { For, Show, createSignal, type JSX } from 'solid-js';

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
  data: RelationshipsData;
  evidence: RelationshipsEvidence[];
  /** Plumbed to DafViewer's argumentMoveHighlight signal — same range/token
   *  shape, reusing the same painter. */
  onHighlightRange?: (range: { start: number; end: number; key: string; tokenStart?: number; tokenEnd?: number } | null) => void;
}

const PRIMARY_COLOR = '#8a2a2b';
const EVIDENCE_BG = '#fef3c7';
const EVIDENCE_BORDER = '#eab308';

export default function RabbiLineageTree(props: Props): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);
  const [activeEvidenceKey, setActiveEvidenceKey] = createSignal<string | null>(null);

  // Map each named person to the first evidence entry referencing them
  // (if any). Used for the soft highlight + click handler. Key = kind:name.
  const evidenceByPerson = (): Map<string, RelationshipsEvidence> => {
    const m = new Map<string, RelationshipsEvidence>();
    for (const e of props.evidence) {
      const k = `${e.kind}:${e.name}`;
      if (!m.has(k)) m.set(k, e);
    }
    return m;
  };

  const visibleTeachers = () => expanded() ? props.data.teachers : props.data.teachers.filter((t) => t.primary);
  const visibleStudents = () => expanded() ? props.data.students : props.data.students.filter((t) => t.primary);

  const hasOverflow = () =>
    props.data.teachers.some((t) => !t.primary)
    || props.data.students.some((t) => !t.primary)
    || props.data.family.length > 0;

  const clickPerson = (kind: 'teacher' | 'student' | 'partner' | 'family', name: string) => {
    const ev = evidenceByPerson().get(`${kind}:${name}`);
    if (!ev || typeof ev.startSegIdx !== 'number' || typeof ev.endSegIdx !== 'number') return;
    const key = `rabbi-evidence:${kind}:${name}:${ev.startSegIdx}:${ev.tokenStart ?? 0}`;
    const alreadyActive = activeEvidenceKey() === key;
    if (alreadyActive) {
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

  const PersonChip = (cp: { kind: 'teacher' | 'student' | 'partner' | 'family'; person: { name: string; primary?: boolean; note?: string; relation?: string } }) => {
    const ev = () => evidenceByPerson().get(`${cp.kind}:${cp.person.name}`);
    const hasEvidence = () => !!ev();
    const key = () => ev() ? `rabbi-evidence:${cp.kind}:${cp.person.name}:${ev()!.startSegIdx}:${ev()!.tokenStart ?? 0}` : '';
    const isActive = () => activeEvidenceKey() === key();
    return (
      <button
        type="button"
        onClick={() => hasEvidence() && clickPerson(cp.kind, cp.person.name)}
        title={ev() ? `On this daf: ${ev()!.note || ev()!.excerpt}` : cp.person.note || ''}
        disabled={!hasEvidence()}
        style={{
          display: 'inline-flex',
          'align-items': 'center',
          gap: '0.3rem',
          padding: '0.2rem 0.55rem',
          'border-radius': '999px',
          border: '1px solid ' + (isActive() ? EVIDENCE_BORDER : hasEvidence() ? '#fde68a' : '#e5e3dc'),
          background: isActive() ? EVIDENCE_BG : hasEvidence() ? '#fefce8' : '#fff',
          color: cp.person.primary ? PRIMARY_COLOR : '#333',
          'font-weight': cp.person.primary ? 600 : 400,
          'font-size': '0.78rem',
          cursor: hasEvidence() ? 'pointer' : 'default',
          'font-family': 'inherit',
          'box-shadow': hasEvidence() ? 'inset 0 -1px 0 ' + EVIDENCE_BORDER : 'none',
        }}
      >
        <Show when={cp.kind === 'family' && (cp.person as { relation?: string }).relation}>
          <span style={{ color: '#888', 'font-size': '0.7rem' }}>{(cp.person as { relation: string }).relation}:</span>
        </Show>
        {cp.person.name}
        <Show when={hasEvidence()}>
          <span style={{ color: '#a16207', 'font-size': '0.62rem' }}>● on daf</span>
        </Show>
      </button>
    );
  };

  return (
    <div style={{
      border: '1px solid #eae8e0',
      'border-radius': '6px',
      background: '#fafaf7',
      padding: '0.7rem 0.85rem',
      'margin-top': '0.9rem',
    }}>
      <div style={{
        'font-size': '0.7rem',
        'text-transform': 'uppercase',
        'letter-spacing': '0.08em',
        color: '#888',
        'margin-bottom': '0.5rem',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
      }}>
        <span>Lineage</span>
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
          >{expanded() ? '› collapse ‹' : '‹ show all ›'}</button>
        </Show>
      </div>

      <Show when={visibleTeachers().length > 0}>
        <div style={{ 'font-size': '0.65rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', 'margin-bottom': '0.3rem' }}>Teachers ↑</div>
        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'margin-bottom': '0.6rem' }}>
          <For each={visibleTeachers()}>{(t) => <PersonChip kind="teacher" person={t} />}</For>
        </div>
      </Show>

      <div style={{
        padding: '0.4rem 0.7rem',
        'border-radius': '4px',
        background: '#fff',
        border: '1px solid #d6d3d1',
        'text-align': 'center',
        'font-weight': 600,
        color: PRIMARY_COLOR,
        'margin-bottom': '0.6rem',
      }}>{props.subjectName}</div>

      <Show when={visibleStudents().length > 0}>
        <div style={{ 'font-size': '0.65rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', 'margin-bottom': '0.3rem' }}>Students ↓</div>
        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'margin-bottom': '0.6rem' }}>
          <For each={visibleStudents()}>{(s) => <PersonChip kind="student" person={s} />}</For>
        </div>
      </Show>

      <Show when={props.data.debatePartners.length > 0}>
        <div style={{ 'font-size': '0.65rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', 'margin-bottom': '0.3rem' }}>Debate partners</div>
        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem', 'margin-bottom': '0.4rem' }}>
          <For each={props.data.debatePartners}>{(d) => <PersonChip kind="partner" person={d} />}</For>
        </div>
      </Show>

      <Show when={expanded() && props.data.family.length > 0}>
        <div style={{ 'font-size': '0.65rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', 'margin-bottom': '0.3rem' }}>Family</div>
        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.35rem' }}>
          <For each={props.data.family}>{(f) => <PersonChip kind="family" person={f} />}</For>
        </div>
      </Show>
    </div>
  );
}
