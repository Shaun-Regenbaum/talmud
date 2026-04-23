import { createMemo, For, Show, type JSX } from 'solid-js';
import { GENERATIONS, type GenerationGroup, type GenerationId } from './generations';
import type { GenerationRabbi } from './injectRabbiUnderlines';

export interface GenerationTimelineProps {
  rabbis: GenerationRabbi[] | null;
  activeGeneration: GenerationId | null;
  onHighlightGeneration: (generation: GenerationId | null, rabbiNames: string[]) => void;
  /** Outer max width — defaults to match the daf content (520px). */
  width?: number;
  showGenMarkers: boolean;
  onToggleGenMarkers: (next: boolean) => void;
  genLoading?: boolean;
  genError?: string | null;
}

// Single chronological amora track. EY (gens 1–5) and Bavel (gens 1–8)
// overlap in time, so each cell here represents one chronological generation
// and folds the EY + Bavel ids for that generation into a single clickable slot.
interface AmoraSlot {
  primaryId: GenerationId;
  ids: GenerationId[];
  color: string;
  label: string;
  era: string;
}

const AMORA_SLOTS: AmoraSlot[] = [
  { primaryId: 'amora-bavel-1', ids: ['amora-ey-1', 'amora-bavel-1'], color: '#7c2d12', label: 'Amora (1)', era: 'c. 220 – 250 CE' },
  { primaryId: 'amora-bavel-2', ids: ['amora-ey-2', 'amora-bavel-2'], color: '#9a3412', label: 'Amora (2)', era: 'c. 250 – 290 CE' },
  { primaryId: 'amora-bavel-3', ids: ['amora-ey-3', 'amora-bavel-3'], color: '#c2410c', label: 'Amora (3)', era: 'c. 290 – 320 CE' },
  { primaryId: 'amora-bavel-4', ids: ['amora-ey-4', 'amora-bavel-4'], color: '#ea580c', label: 'Amora (4)', era: 'c. 320 – 350 CE' },
  { primaryId: 'amora-bavel-5', ids: ['amora-ey-5', 'amora-bavel-5'], color: '#f97316', label: 'Amora (5)', era: 'c. 350 – 400 CE' },
  { primaryId: 'amora-bavel-6', ids: ['amora-bavel-6'],                color: '#fb923c', label: 'Amora (6)', era: 'c. 375 – 427 CE' },
  { primaryId: 'amora-bavel-7', ids: ['amora-bavel-7'],                color: '#fdba74', label: 'Amora (7)', era: 'c. 427 – 460 CE' },
  { primaryId: 'amora-bavel-8', ids: ['amora-bavel-8'],                color: '#fed7aa', label: 'Amora (8)', era: 'c. 460 – 500 CE' },
];

function gensByGroup(group: GenerationGroup) {
  return GENERATIONS.filter((g) => g.group === group);
}

export function GenerationTimeline(props: GenerationTimelineProps): JSX.Element {
  const rabbisByGen = createMemo(() => {
    const m = new Map<GenerationId, string[]>();
    for (const r of props.rabbis ?? []) {
      const arr = m.get(r.generation) ?? [];
      if (!arr.includes(r.name)) arr.push(r.name);
      m.set(r.generation, arr);
    }
    return m;
  });

  const collectNames = (ids: GenerationId[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      for (const n of rabbisByGen().get(id) ?? []) {
        if (!seen.has(n)) { seen.add(n); out.push(n); }
      }
    }
    return out;
  };

  const onCellClick = (primaryId: GenerationId, ids: GenerationId[]) => {
    const names = collectNames(ids);
    if (names.length === 0) return;
    const isActive = ids.includes(props.activeGeneration as GenerationId);
    props.onHighlightGeneration(isActive ? null : primaryId, isActive ? [] : names);
  };

  const Cell = (cprops: {
    primaryId: GenerationId;
    ids: GenerationId[];
    color: string;
    label: string;
    era: string;
  }) => {
    const names = () => collectNames(cprops.ids);
    const present = () => names().length > 0;
    const active = () => cprops.ids.includes(props.activeGeneration as GenerationId);
    const count = () => names().length;
    return (
      <button
        onClick={() => onCellClick(cprops.primaryId, cprops.ids)}
        disabled={!present()}
        title={present() ? `${cprops.label} · ${cprops.era}\n${names().join(', ')}` : `${cprops.label} · ${cprops.era} (none in this daf)`}
        style={{
          position: 'relative',
          flex: 1,
          'min-width': 0,
          padding: 0,
          border: active() ? '2px solid #1f2937' : '1px solid ' + (present() ? 'rgba(0,0,0,0.18)' : '#e5e7eb'),
          'border-radius': '3px',
          background: present() ? cprops.color : '#f3f4f6',
          opacity: present() ? 1 : 0.4,
          height: '14px',
          cursor: present() ? 'pointer' : 'default',
          'box-shadow': active() ? '0 0 0 2px rgba(31, 41, 55, 0.15)' : 'none',
          'line-height': 0,
        }}
      >
        {count() > 0 ? (
          <span
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              'font-size': '0.58rem', 'font-weight': 600, color: '#fff',
              'text-shadow': '0 0 2px rgba(0,0,0,0.4)', 'line-height': 1,
              'pointer-events': 'none',
            }}
          >
            {count()}
          </span>
        ) : null}
      </button>
    );
  };

  const zugim = gensByGroup('zugim');
  const tanna = gensByGroup('tanna');
  const savora = gensByGroup('savora');

  const sectionStyle: JSX.CSSProperties = {
    flex: 1,
    'min-width': 0,
    display: 'flex',
    'flex-direction': 'column',
    gap: '3px',
  };
  const sectionHeader: JSX.CSSProperties = {
    'text-align': 'center',
    'font-size': '0.62rem',
    color: '#9ca3af',
    'text-transform': 'uppercase',
    'letter-spacing': '0.04em',
  };
  const cellRow: JSX.CSSProperties = { display: 'flex', gap: '2px' };

  return (
    <section
      style={{
        'max-width': props.width ? `${props.width}px` : '520px',
        'margin-left': 'auto',
        'margin-right': 'auto',
        'margin-bottom': '0.75rem',
        padding: '0.45rem 0.6rem 0.55rem',
        border: '1px solid #eee',
        'border-radius': '6px',
        background: '#fcfcfa',
        'font-family': 'system-ui, -apple-system, sans-serif',
        'font-size': '0.75rem',
        color: '#555',
      }}
    >
      {/* Header row: underline toggle sits next to the timeline. */}
      <div
        style={{
          display: 'flex',
          'justify-content': 'flex-end',
          'align-items': 'center',
          'margin-bottom': '0.3rem',
        }}
      >
        <label
          style={{
            display: 'inline-flex',
            'align-items': 'center',
            gap: '0.35rem',
            cursor: 'pointer',
            'font-size': '0.7rem',
            color: '#666',
          }}
        >
          <input
            type="checkbox"
            checked={props.showGenMarkers}
            onChange={(e) => props.onToggleGenMarkers(e.currentTarget.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span>Rabbi-era underlines</span>
          <Show when={props.genLoading}>
            <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.35rem', color: '#888', 'font-size': '0.65rem' }}>
              <span style={{
                display: 'inline-block', width: '0.65rem', height: '0.65rem',
                'border-radius': '50%',
                border: '2px solid #d6d3d1', 'border-top-color': '#7c2d12',
                animation: 'daf-spin 0.8s linear infinite',
              }} />
              Organizing the timeline…
            </span>
          </Show>
          <Show when={props.genError}>
            <span style={{ color: '#c33', 'font-size': '0.65rem' }}>failed</span>
          </Show>
        </label>
      </div>

      {/* Four equal-width sections. */}
      <div style={{ display: 'flex', gap: '6px', 'align-items': 'stretch' }}>
        <div style={sectionStyle}>
          <div style={sectionHeader}>Zugim</div>
          <div style={cellRow}>
            {Cell({ primaryId: zugim[0].id, ids: [zugim[0].id], color: zugim[0].color, label: zugim[0].label, era: zugim[0].era })}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionHeader}>Tannaim</div>
          <div style={cellRow}>
            <For each={tanna}>
              {(t) => Cell({ primaryId: t.id, ids: [t.id], color: t.color, label: t.label, era: t.era })}
            </For>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionHeader}>Amoraim</div>
          <div style={cellRow}>
            <For each={AMORA_SLOTS}>
              {(s) => Cell({ primaryId: s.primaryId, ids: s.ids, color: s.color, label: s.label, era: s.era })}
            </For>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionHeader}>Savoraim</div>
          <div style={cellRow}>
            {Cell({ primaryId: savora[0].id, ids: [savora[0].id], color: savora[0].color, label: savora[0].label, era: savora[0].era })}
          </div>
        </div>
      </div>
    </section>
  );
}
