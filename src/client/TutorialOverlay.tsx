/**
 * Renders the first-time-user tour driven by tutorial.ts.
 *
 * Placement: when a step names an on-screen `data-tour` target, a dim cutout
 * rings the real element and the card is placed on whichever side has the most
 * room (bottom → top → right → left), with its height capped to that side's
 * available space and internal scroll — so it can never be clipped by the
 * viewport. When no side fits, or the target is missing / the step has no
 * target, the card centers as a modal. The card is measured after render and
 * stays hidden until positioned, so there's no jump.
 *
 * The cutout has pointer-events:none, so the highlighted control stays
 * clickable. RTL falls out of the document `dir` the i18n layer already sets.
 */
import { createSignal, createEffect, onCleanup, Show, For, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { t } from './i18n';
import {
  currentStep,
  tourActive,
  tourIndex,
  nextStep,
  prevStep,
  skipTour,
  openTutorialNote,
  closeTutorialNote,
  TOUR_STEPS,
  type TourIllustration,
} from './tutorial';
import { GutterGlyph, colorForKind, type GutterKind } from './GutterIcons';
import { colorForGeneration, legibleTextColor, type GenerationId } from './generations';

const GAP = 14;
const PAD = 12; // viewport margin
const MIN_VERT = 200; // min height before we prefer a horizontal side
const MIN_HORIZ = 320; // min width to place beside the target

type Pos =
  | { mode: 'center' }
  | { mode: 'anchor'; top: number; left: number; maxH: number; side: 'top' | 'bottom' | 'left' | 'right' };

export function TutorialOverlay(): JSX.Element {
  const [rect, setRect] = createSignal<DOMRect | null>(null);
  const [pos, setPos] = createSignal<Pos | null>(null);
  let cardEl: HTMLDivElement | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  // `attempt` lets us wait for targets that render asynchronously — chiefly the
  // "Inside a note" step, whose panel/drawer only mounts after we ask the
  // DafViewer to open the note. We keep re-checking briefly, then settle into
  // the centered fallback if the target genuinely never appears.
  const measure = (attempt = 0) => {
    clearTimeout(retryTimer);
    const step = currentStep();
    if (!step?.target) { setRect(null); reposition(); return; }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      reposition();
      if (attempt < 12) retryTimer = setTimeout(() => measure(attempt + 1), 120);
      return;
    }
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    setRect(el.getBoundingClientRect());
    reposition();
  };
  onCleanup(() => clearTimeout(retryTimer));

  const reposition = () => {
    const r = rect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!r || !cardEl) { setPos(r ? null : { mode: 'center' }); return; }
    const cw = cardEl.offsetWidth || 340;
    const ch = cardEl.offsetHeight || 260;

    const below = vh - r.bottom - GAP - PAD;
    const above = r.top - GAP - PAD;
    const right = vw - r.right - GAP - PAD;
    const left = r.left - GAP - PAD;

    const clampLeft = (x: number) => Math.max(PAD, Math.min(x, vw - cw - PAD));
    const clampTop = (y: number) => Math.max(PAD, Math.min(y, vh - Math.min(ch, vh - 2 * PAD) - PAD));

    // Prefer the vertical side with more room when it can show a useful height.
    const vside = below >= above ? 'bottom' : 'top';
    const vspace = Math.max(below, above);
    if (vspace >= MIN_VERT) {
      const maxH = vspace;
      const top = vside === 'bottom' ? r.bottom + GAP : r.top - GAP - Math.min(ch, maxH);
      setPos({ mode: 'anchor', side: vside, top: clampTop(top), left: clampLeft(r.left + r.width / 2 - cw / 2), maxH });
      return;
    }
    // Otherwise place beside the target, vertically centered.
    const hside = right >= left ? 'right' : 'left';
    const hspace = Math.max(right, left);
    if (hspace >= MIN_HORIZ) {
      const maxH = vh - 2 * PAD;
      const leftX = hside === 'right' ? r.right + GAP : r.left - GAP - cw;
      setPos({ mode: 'anchor', side: hside, top: clampTop(r.top + r.height / 2 - ch / 2), left: leftX, maxH });
      return;
    }
    setPos({ mode: 'center' });
  };

  // Re-measure on step change and keep the cutout glued through scroll/resize.
  createEffect(() => {
    if (!tourActive()) { setRect(null); setPos(null); return; }
    tourIndex(); // track step changes
    setPos(null); // hide until re-measured
    requestAnimationFrame(() => requestAnimationFrame(measure));
  });
  createEffect(() => {
    if (!tourActive()) return;
    const onMove = () => requestAnimationFrame(measure);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    onCleanup(() => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    });
  });

  // The "Inside a note" step opens a real note (the whole-daf Overview) so the
  // reader sees the actual side panel / drawer; any other step (or the tour
  // ending → currentStep() null) closes it again.
  createEffect(() => {
    if (currentStep()?.id === 'card') openTutorialNote();
    else closeTutorialNote();
  });

  return (
    <Show when={currentStep()}>
      {(step) => {
        const isCenter = () => !step().target || !rect() || pos()?.mode === 'center';
        return (
          <Portal>
            {/* Backdrop: dim everything. Spotlight punches a hole via the ring's
                box-shadow; centered mode dims uniformly. */}
            <Show
              when={!isCenter() && rect()}
              fallback={
                <div style={{ position: 'fixed', inset: '0', 'z-index': '5000', background: 'rgba(17,24,39,0.55)' }} />
              }
            >
              <div
                aria-hidden="true"
                style={{
                  position: 'fixed',
                  top: `${rect()!.top - 6}px`,
                  left: `${rect()!.left - 6}px`,
                  width: `${rect()!.width + 12}px`,
                  height: `${rect()!.height + 12}px`,
                  'border-radius': '6px',
                  'box-shadow': '0 0 0 9999px rgba(17,24,39,0.55), 0 0 0 2px rgba(255,255,255,0.9), 0 0 0 5px #2563eb',
                  'z-index': '5000',
                  'pointer-events': 'none',
                  transition: 'top 0.22s ease, left 0.22s ease, width 0.22s ease, height 0.22s ease',
                }}
              />
            </Show>

            {/* The card. Hidden (opacity 0) until measured + positioned. */}
            <div
              ref={cardEl}
              style={{
                position: 'fixed',
                'z-index': '5002',
                width: 'min(380px, calc(100vw - 24px))',
                'box-sizing': 'border-box',
                ...(isCenter()
                  ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                  : pos()?.mode === 'anchor'
                    ? { top: `${(pos() as Extract<Pos, { mode: 'anchor' }>).top}px`, left: `${(pos() as Extract<Pos, { mode: 'anchor' }>).left}px` }
                    : {}),
                'max-height':
                  pos()?.mode === 'anchor'
                    ? `${Math.max(MIN_VERT, (pos() as Extract<Pos, { mode: 'anchor' }>).maxH)}px`
                    : 'calc(100vh - 24px)',
                opacity: pos() ? '1' : '0',
                transition: 'opacity 0.15s ease, top 0.22s ease, left 0.22s ease',
                'pointer-events': 'auto',
                display: 'flex',
                'flex-direction': 'column',
                background: '#ffffff',
                border: '1px solid #d1d5db',
                'border-radius': '4px',
                'box-shadow': '0 12px 40px rgba(0,0,0,0.22)',
              }}
            >
              <CardInner step={step()} />
            </div>
          </Portal>
        );
      }}
    </Show>
  );
}

function CardInner(props: { step: NonNullable<ReturnType<typeof currentStep>> }): JSX.Element {
  const step = () => props.step;
  const isLast = () => tourIndex() >= TOUR_STEPS.length - 1;

  return (
    <>
      {/* Scrollable content */}
      <div style={{ padding: '18px 20px 0', 'overflow-y': 'auto', 'flex': '1 1 auto' }}>
        <div style={{ 'font-size': '11px', 'letter-spacing': '0.05em', 'text-transform': 'uppercase', color: '#6b7280', 'margin-bottom': '6px', 'font-weight': 600 }}>
          {t(step().chapterKey)}
        </div>
        <div style={{ 'font-size': '18px', 'font-weight': 700, 'margin-bottom': '8px', color: '#111827', 'line-height': 1.25 }}>
          {t(step().titleKey)}
        </div>
        <div style={{ 'font-size': '14px', 'line-height': 1.55, color: '#374151' }}>
          {t(step().bodyKey)}
        </div>
        <Show when={step().illustration}>
          {(kind) => <Illustration kind={kind()} />}
        </Show>
      </div>

      {/* Footer: progress dots + actions, pinned below the scroll area. */}
      <div style={{ padding: '14px 20px 16px', 'border-top': '1px solid #f3f4f6', 'flex': '0 0 auto' }}>
        <Dots />
        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '8px', 'margin-top': '12px' }}>
          <button type="button" onClick={skipTour} style={linkBtn()}>{t('tutorial.skip')}</button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Show when={tourIndex() > 0}>
              <button type="button" onClick={prevStep} style={ghostBtn()}>{t('tutorial.back')}</button>
            </Show>
            <button type="button" onClick={nextStep} style={primaryBtn()}>
              {isLast() ? t('tutorial.done') : t('tutorial.next')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Dots(): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '6px', 'justify-content': 'center' }}>
      <For each={TOUR_STEPS}>
        {(_, i) => (
          <span
            aria-hidden="true"
            style={{
              width: i() === tourIndex() ? '18px' : '6px',
              height: '6px',
              'border-radius': '3px',
              background: i() === tourIndex() ? '#2563eb' : '#d1d5db',
              transition: 'width 0.2s ease, background 0.2s ease',
            }}
          />
        )}
      </For>
    </div>
  );
}

function primaryBtn(): JSX.CSSProperties {
  return {
    background: '#2563eb', color: '#fff', border: '1px solid #2563eb',
    'border-radius': '3px', padding: '8px 16px', 'font-size': '13px',
    'font-weight': 600, cursor: 'pointer', 'white-space': 'nowrap',
  };
}
function ghostBtn(): JSX.CSSProperties {
  return {
    background: '#fff', color: '#374151', border: '1px solid #d1d5db',
    'border-radius': '3px', padding: '8px 14px', 'font-size': '13px',
    cursor: 'pointer', 'white-space': 'nowrap',
  };
}
function linkBtn(): JSX.CSSProperties {
  return {
    background: 'transparent', color: '#6b7280', border: 'none',
    padding: '8px 4px', 'font-size': '13px', cursor: 'pointer', 'white-space': 'nowrap',
  };
}

// ---------------------------------------------------------------------------
// Illustrations — legend / mock visuals drawn under a step's body.
// ---------------------------------------------------------------------------

const MARK_KINDS: { kind: GutterKind; labelKey: string; descKey: string }[] = [
  { kind: 'argument', labelKey: 'tutorial.icon.argument.label', descKey: 'tutorial.icon.argument.desc' },
  { kind: 'halacha', labelKey: 'tutorial.icon.halacha.label', descKey: 'tutorial.icon.halacha.desc' },
  { kind: 'aggadata', labelKey: 'tutorial.icon.aggadata.label', descKey: 'tutorial.icon.aggadata.desc' },
  { kind: 'pesuk', labelKey: 'tutorial.icon.pesuk.label', descKey: 'tutorial.icon.pesuk.desc' },
  { kind: 'rishonim', labelKey: 'tutorial.icon.rishonim.label', descKey: 'tutorial.icon.rishonim.desc' },
];

const EARLY_SAMPLE: GenerationId[] = ['zugim', 'tanna-4', 'amora-bavel-4', 'savora'];
const LATE_SAMPLE: GenerationId[] = ['geonim', 'rishonim', 'achronim'];

function Illustration(props: { kind: TourIllustration }): JSX.Element {
  return (
    <div style={{ 'margin-top': '14px' }}>
      <Show when={props.kind === 'icons'}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
          <For each={MARK_KINDS}>
            {(m) => (
              <div style={{ display: 'flex', 'align-items': 'flex-start', gap: '10px' }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center',
                    width: '22px', height: '22px', 'border-radius': '50%', 'flex': '0 0 auto', 'margin-top': '1px',
                    background: colorForKind(m.kind), color: '#fff',
                  }}
                >
                  <GutterGlyph kind={m.kind} />
                </span>
                <span style={{ 'font-size': '13.5px', color: '#374151', 'line-height': 1.4 }}>
                  <b style={{ color: '#111827' }}>{t(m.labelKey)}</b> — {t(m.descKey)}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.kind === 'spectrum'}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
          <SpectrumRow labelKey="tutorial.underline.early" ids={EARLY_SAMPLE} />
          <SpectrumRow labelKey="tutorial.underline.late" ids={LATE_SAMPLE} />
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-top': '2px' }}>
            <span style={{ 'font-size': '15px', 'border-bottom': '2px dotted #6b7280', 'padding-bottom': '1px', cursor: 'help', color: '#374151' }}>
              הֶקֵּשׁ
            </span>
            <span style={{ 'font-size': '12px', color: '#6b7280' }}>{t('tutorial.underline.dotted')}</span>
          </div>
        </div>
      </Show>

      <Show when={props.kind === 'translate'}>
        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '10px', 'font-size': '16px' }}>
          <span style={{ 'border-bottom': '2px solid #2563eb', cursor: 'pointer', 'padding-bottom': '1px' }}>גַּבְרָא</span>
          <span style={{ color: '#9ca3af' }}>→</span>
          <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', 'border-radius': '3px', padding: '3px 10px', 'font-size': '14px', color: '#1e40af' }}>{t('tutorial.translate.example')}</span>
        </div>
      </Show>

      <Show when={props.kind === 'qa'}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
            <span style={pill()}>{t('tutorial.qa.example1')}</span>
            <span style={pill()}>{t('tutorial.qa.example2')}</span>
          </div>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', border: '1px solid #d1d5db', 'border-radius': '3px', padding: '7px 10px', 'font-size': '13px', color: '#9ca3af', background: '#f9fafb' }}>
            <span style={{ flex: '1 1 auto' }}>{t('tutorial.qa.placeholder')}</span>
            <span style={{ color: '#2563eb', 'font-weight': 700 }}>↵</span>
          </div>
        </div>
      </Show>

    </div>
  );
}

function pill(): JSX.CSSProperties {
  return {
    'font-size': '12px', background: '#eff6ff', color: '#1e40af',
    border: '1px solid #bfdbfe', 'border-radius': '999px', padding: '3px 10px', 'white-space': 'nowrap',
  };
}
function SpectrumRow(props: { labelKey: string; ids: GenerationId[] }): JSX.Element {
  return (
    <div>
      <div style={{ 'font-size': '12px', color: '#6b7280', 'margin-bottom': '5px' }}>{t(props.labelKey)}</div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <For each={props.ids}>
          {(id) => {
            const bg = colorForGeneration(id);
            return (
              <span
                style={{
                  display: 'inline-block', height: '16px', flex: '1 1 0',
                  background: bg, 'border-radius': '2px', color: legibleTextColor(bg),
                }}
              />
            );
          }}
        </For>
      </div>
    </div>
  );
}
