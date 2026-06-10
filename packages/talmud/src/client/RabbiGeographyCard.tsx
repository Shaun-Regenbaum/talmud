/**
 * Geography card for a rabbi: birthplace, primary study place(s), notable
 * places (story locations), and any Bavel↔Eretz Yisrael movements. The
 * movements timeline is the headline element when movements exist — it's
 * the question the user explicitly cares about ("did he ever go between
 * Bavel and Israel and if so when").
 *
 * Items that this daf actually references (via `rabbi.geography.evidence`)
 * get a soft highlight + click handler that paints the cited Hebrew on
 * the daf via onHighlightRange.
 */

import { createSignal, For, type JSX, Show } from 'solid-js';
import { t } from './i18n';

export interface BirthPlace {
  place: string;
  region: 'israel' | 'bavel' | 'other' | 'unknown';
}

export interface StudyPlace {
  place: string;
  academy?: string;
  period?: string;
}

export interface NotablePlace {
  place: string;
  event: string;
}

export interface Movement {
  from: string;
  to: string;
  approximateWhen?: string;
  reason?: string;
}

export interface GeographyData {
  birthplace?: BirthPlace;
  primaryStudyPlaces: StudyPlace[];
  notablePlaces: NotablePlace[];
  movements: Movement[];
  prose?: string;
}

export interface GeographyEvidence {
  kind: 'birthplace' | 'study' | 'notable' | 'movement';
  place: string;
  excerpt: string;
  note: string;
  startSegIdx?: number;
  endSegIdx?: number;
  tokenStart?: number;
  tokenEnd?: number;
}

interface Props {
  data: GeographyData;
  evidence: GeographyEvidence[];
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

const ISRAEL_COLOR = '#1d4ed8';
const BAVEL_COLOR = '#b45309';
const OTHER_COLOR = '#475569';
const EVIDENCE_BG = '#fef3c7';
const EVIDENCE_BORDER = '#eab308';

function regionColor(r: BirthPlace['region']): string {
  if (r === 'israel') return ISRAEL_COLOR;
  if (r === 'bavel') return BAVEL_COLOR;
  return OTHER_COLOR;
}

function regionLabel(r: BirthPlace['region']): string {
  if (r === 'israel') return t('geography.eretzYisrael');
  if (r === 'bavel') return t('geography.bavel');
  return r === 'other' ? t('region.other') : t('region.unknown');
}

export default function RabbiGeographyCard(props: Props): JSX.Element {
  const [activeEvidenceKey, setActiveEvidenceKey] = createSignal<string | null>(null);

  // Index evidence by kind + place so a chip can light up when this daf
  // references it. First-match wins (multiple evidence rows for the same
  // place collapse to one highlight).
  const evidenceByPlace = (): Map<string, GeographyEvidence> => {
    const m = new Map<string, GeographyEvidence>();
    for (const e of props.evidence) {
      const k = `${e.kind}:${e.place}`.toLowerCase();
      if (!m.has(k)) m.set(k, e);
    }
    return m;
  };

  const lookupEvidence = (
    kind: GeographyEvidence['kind'],
    place: string,
  ): GeographyEvidence | undefined => evidenceByPlace().get(`${kind}:${place}`.toLowerCase());

  const clickEvidence = (ev: GeographyEvidence | undefined) => {
    if (!ev || typeof ev.startSegIdx !== 'number' || typeof ev.endSegIdx !== 'number') return;
    const key = `rabbi-geo-evidence:${ev.kind}:${ev.place}:${ev.startSegIdx}:${ev.tokenStart ?? 0}`;
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

  const PlaceRow = (rp: {
    kind: GeographyEvidence['kind'];
    label: string;
    sublabel?: string;
    tone?: string;
  }) => {
    const ev = () => lookupEvidence(rp.kind, rp.label);
    const hasEv = () => !!ev();
    const key = () =>
      ev()
        ? `rabbi-geo-evidence:${ev()!.kind}:${ev()!.place}:${ev()!.startSegIdx}:${ev()!.tokenStart ?? 0}`
        : '';
    const isActive = () => activeEvidenceKey() === key();
    return (
      <button
        type="button"
        onClick={() => hasEv() && clickEvidence(ev())}
        disabled={!hasEv()}
        title={
          ev() ? t('rabbi.onThisDaf', { text: ev()!.note || ev()!.excerpt }) : rp.sublabel || ''
        }
        style={{
          display: 'inline-flex',
          'align-items': 'center',
          gap: '0.35rem',
          padding: '0.2rem 0.55rem',
          'border-radius': '4px',
          border: `1px solid ${isActive() ? EVIDENCE_BORDER : hasEv() ? '#fde68a' : '#e5e3dc'}`,
          background: isActive() ? EVIDENCE_BG : hasEv() ? '#fefce8' : '#fff',
          color: '#333',
          'font-size': '0.8rem',
          cursor: hasEv() ? 'pointer' : 'default',
          'font-family': 'inherit',
          'text-align': 'left',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '0.55rem',
            height: '0.55rem',
            'border-radius': '50%',
            background: rp.tone ?? OTHER_COLOR,
            'flex-shrink': 0,
          }}
        />
        <span style={{ 'font-weight': 500 }}>{rp.label}</span>
        <Show when={rp.sublabel}>
          <span style={{ color: '#888', 'font-size': '0.72rem' }}>· {rp.sublabel}</span>
        </Show>
        <Show when={hasEv()}>
          <span style={{ color: '#a16207', 'font-size': '0.62rem', 'margin-left': '0.2rem' }}>
            ● {t('rabbi.onDaf')}
          </span>
        </Show>
      </button>
    );
  };

  const Movement = (mv: { m: Movement; idx: number }) => {
    const ev = () => lookupEvidence('movement', mv.m.to) ?? lookupEvidence('movement', mv.m.from);
    const hasEv = () => !!ev();
    const key = () =>
      ev()
        ? `rabbi-geo-evidence:movement:${ev()!.place}:${ev()!.startSegIdx}:${ev()!.tokenStart ?? 0}`
        : '';
    const isActive = () => activeEvidenceKey() === key();
    const fromIsBavel = () =>
      mv.m.from.toLowerCase().includes('bavel') ||
      mv.m.from.toLowerCase().includes('pumbedita') ||
      mv.m.from.toLowerCase().includes('sura') ||
      mv.m.from.toLowerCase().includes('nehardea');
    const toIsBavel = () =>
      mv.m.to.toLowerCase().includes('bavel') ||
      mv.m.to.toLowerCase().includes('pumbedita') ||
      mv.m.to.toLowerCase().includes('sura') ||
      mv.m.to.toLowerCase().includes('nehardea');
    const fromColor = () => (fromIsBavel() ? BAVEL_COLOR : ISRAEL_COLOR);
    const toColor = () => (toIsBavel() ? BAVEL_COLOR : ISRAEL_COLOR);
    return (
      <button
        type="button"
        onClick={() => hasEv() && clickEvidence(ev())}
        disabled={!hasEv()}
        title={
          ev() ? t('rabbi.onThisDaf', { text: ev()!.note || ev()!.excerpt }) : mv.m.reason || ''
        }
        style={{
          width: '100%',
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'flex-start',
          padding: '0.45rem 0.6rem',
          'border-radius': '4px',
          border: `1px solid ${isActive() ? EVIDENCE_BORDER : hasEv() ? '#fde68a' : '#e5e3dc'}`,
          background: isActive() ? EVIDENCE_BG : hasEv() ? '#fefce8' : '#fff',
          'margin-bottom': '0.4rem',
          cursor: hasEv() ? 'pointer' : 'default',
          'font-family': 'inherit',
          'text-align': 'left',
        }}
      >
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '0.4rem',
            'font-size': '0.82rem',
          }}
        >
          <span style={{ color: fromColor(), 'font-weight': 600 }}>{mv.m.from}</span>
          <span style={{ color: '#999' }}>→</span>
          <span style={{ color: toColor(), 'font-weight': 600 }}>{mv.m.to}</span>
          <Show when={hasEv()}>
            <span style={{ color: '#a16207', 'font-size': '0.62rem', 'margin-left': 'auto' }}>
              ● {t('rabbi.onDaf')}
            </span>
          </Show>
        </div>
        <Show when={mv.m.approximateWhen}>
          <div style={{ 'font-size': '0.72rem', color: '#666', 'margin-top': '0.15rem' }}>
            {mv.m.approximateWhen}
          </div>
        </Show>
        <Show when={mv.m.reason}>
          <div
            style={{
              'font-size': '0.72rem',
              color: '#888',
              'margin-top': '0.05rem',
              'font-style': 'italic',
            }}
          >
            {mv.m.reason}
          </div>
        </Show>
      </button>
    );
  };

  const hasAny = () =>
    props.data.birthplace?.place ||
    props.data.primaryStudyPlaces.length > 0 ||
    props.data.notablePlaces.length > 0 ||
    props.data.movements.length > 0;

  return (
    <Show when={hasAny()}>
      <div
        style={{
          border: '1px solid #eae8e0',
          'border-radius': '6px',
          background: '#fafaf7',
          padding: '0.7rem 0.85rem',
          'margin-top': '0.7rem',
        }}
      >
        <div
          style={{
            'font-size': '0.7rem',
            'text-transform': 'uppercase',
            'letter-spacing': '0.08em',
            color: '#888',
            'margin-bottom': '0.5rem',
          }}
        >
          {t('rabbi.geography.title')}
        </div>

        <Show when={props.data.movements.length > 0}>
          <div
            style={{
              'font-size': '0.65rem',
              color: '#999',
              'text-transform': 'uppercase',
              'letter-spacing': '0.06em',
              'margin-bottom': '0.3rem',
            }}
          >
            {t('rabbi.geography.movements')}
          </div>
          <div style={{ 'margin-bottom': '0.6rem' }}>
            <For each={props.data.movements}>{(m, i) => <Movement m={m} idx={i()} />}</For>
          </div>
        </Show>

        <Show when={props.data.birthplace?.place}>
          <div
            style={{
              'font-size': '0.65rem',
              color: '#999',
              'text-transform': 'uppercase',
              'letter-spacing': '0.06em',
              'margin-bottom': '0.3rem',
            }}
          >
            {t('rabbi.geography.birthplace')}
          </div>
          <div style={{ 'margin-bottom': '0.5rem' }}>
            <PlaceRow
              kind="birthplace"
              label={props.data.birthplace!.place}
              sublabel={regionLabel(props.data.birthplace!.region)}
              tone={regionColor(props.data.birthplace!.region)}
            />
          </div>
        </Show>

        <Show when={props.data.primaryStudyPlaces.length > 0}>
          <div
            style={{
              'font-size': '0.65rem',
              color: '#999',
              'text-transform': 'uppercase',
              'letter-spacing': '0.06em',
              'margin-bottom': '0.3rem',
            }}
          >
            {t('rabbi.geography.studiedAt')}
          </div>
          <div
            style={{
              display: 'flex',
              'flex-wrap': 'wrap',
              gap: '0.35rem',
              'margin-bottom': '0.5rem',
            }}
          >
            <For each={props.data.primaryStudyPlaces}>
              {(s) => (
                <PlaceRow
                  kind="study"
                  label={s.place}
                  sublabel={[s.academy, s.period].filter(Boolean).join(' · ')}
                />
              )}
            </For>
          </div>
        </Show>

        <Show when={props.data.notablePlaces.length > 0}>
          <div
            style={{
              'font-size': '0.65rem',
              color: '#999',
              'text-transform': 'uppercase',
              'letter-spacing': '0.06em',
              'margin-bottom': '0.3rem',
            }}
          >
            {t('rabbi.geography.notablePlaces')}
          </div>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.25rem' }}>
            <For each={props.data.notablePlaces}>
              {(n) => <PlaceRow kind="notable" label={n.place} sublabel={n.event} />}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
