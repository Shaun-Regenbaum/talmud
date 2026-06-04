/**
 * The tutorial coach — walks you around the REAL daf rendered behind it on the
 * #tutorial page. Each step either spotlights a real control (a dim cutout rings
 * the element; the control stays clickable because the cutout is
 * pointer-events:none) or centres with a small legend for a concept. Note steps
 * open a real note; on mobile the header drawer is opened/collapsed so the
 * spotlit control is actually on screen.
 *
 * Placement:
 *   • Desktop: the card sits on whichever side of the target has the most room
 *     (bottom → top → right → left), capped to that side's height with internal
 *     scroll, or centres when nothing fits / there's no target.
 *   • Mobile: the card is a sheet pinned away from whatever the step uses — at
 *     the BOTTOM for header/daf targets (note drawer is bottom, so) and at the
 *     TOP for note steps (the note fills the bottom). The target is scrolled
 *     into the free area. This sidesteps the collisions that made the old
 *     overlay flaky on phones.
 */
import { createSignal, createEffect, onCleanup, onMount, Show, For, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { t, lang } from './i18n';
import {
  TOUR_STEPS,
  markCompleted,
  openTutorialNote,
  closeTutorialNote,
  setTutorialHeader,
  type TourSupplement,
} from './tutorial';
import { GutterGlyph, colorForKind, type GutterKind } from './GutterIcons';
import { colorForGeneration, legibleTextColor, type GenerationId } from './generations';

const GAP = 14;
const PAD = 12;
const MIN_VERT = 200;
const MIN_HORIZ = 320;
const MOBILE_BAR = 72; // room left for the mobile mode bar at the very bottom
// A note panel is very tall; ring only its top (title + summary) instead of the
// whole sidebar, which reads as "everything is highlighted" and looks wrong.
const MAX_RING_H = 240;

type Pos =
  | { mode: 'center' }
  | { mode: 'anchor'; top: number; left: number; maxH: number; side: 'top' | 'bottom' | 'left' | 'right' };

export function TutorialCoach(): JSX.Element {
  const [i, setI] = createSignal(0);
  const total = TOUR_STEPS.length;
  const step = () => TOUR_STEPS[i()];
  const isLast = () => i() >= total - 1;

  const [isMobile, setIsMobile] = createSignal(
    typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches,
  );
  createEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener('change', update);
    onCleanup(() => mq.removeEventListener('change', update));
  });

  const [rect, setRect] = createSignal<DOMRect | null>(null);
  const [pos, setPos] = createSignal<Pos | null>(null);
  let cardEl: HTMLDivElement | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    closeTutorialNote();
    setTutorialHeader(false);
    markCompleted();
    window.location.hash = 'daf';
  };
  const next = () => (isLast() ? finish() : setI(i() + 1));
  const back = () => setI(Math.max(0, i() - 1));

  // Where the mobile sheet sits: away from what the step occupies.
  const mobileAnchor = (): 'top' | 'bottom' => (step().note ? 'top' : 'bottom');

  const measure = (attempt = 0) => {
    clearTimeout(retryTimer);
    const s = step();
    const sel = s.selector ?? (s.target ? `[data-tour="${s.target}"]` : null);
    if (!sel) { setRect(null); reposition(); return; }
    const els = document.querySelectorAll(sel);
    if (!els.length) {
      setRect(null);
      reposition();
      // Marks / notes load async — keep looking for a few seconds, then settle
      // into the centered fallback if the target genuinely never appears.
      if (attempt < 30) retryTimer = setTimeout(() => measure(attempt + 1), 120);
      return;
    }
    // Pick which match to spotlight (e.g. a rabbi name from the body, not the
    // first one crammed against the top).
    let idx = 0;
    if (s.selectorIndex === 'middle') idx = Math.floor(els.length / 2);
    else if (typeof s.selectorIndex === 'number') idx = Math.max(0, Math.min(s.selectorIndex, els.length - 1));
    const el = els[idx];
    // Scroll the target into the area the card won't cover.
    const block = isMobile() && mobileAnchor() === 'bottom' ? 'start' : 'center';
    el.scrollIntoView({ block: block as ScrollLogicalPosition, inline: 'center', behavior: 'smooth' });
    const raw = el.getBoundingClientRect();
    // Ring only the top of a very tall target (a note panel), so we point at the
    // note's summary rather than appearing to highlight the whole sidebar.
    const h = Math.min(raw.height, MAX_RING_H);
    setRect(new DOMRect(raw.left, raw.top, raw.width, h));
    reposition();
  };
  onCleanup(() => clearTimeout(retryTimer));

  const reposition = () => {
    if (isMobile()) { setPos(null); return; } // mobile uses fixed sheets, not side math
    const r = rect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!r || !cardEl) { setPos(r ? null : { mode: 'center' }); return; }
    const cw = cardEl.offsetWidth || 360;
    const ch = cardEl.offsetHeight || 280;
    const below = vh - r.bottom - GAP - PAD;
    const above = r.top - GAP - PAD;
    const right = vw - r.right - GAP - PAD;
    const left = r.left - GAP - PAD;
    const clampLeft = (x: number) => Math.max(PAD, Math.min(x, vw - cw - PAD));
    const clampTop = (y: number) => Math.max(PAD, Math.min(y, vh - Math.min(ch, vh - 2 * PAD) - PAD));
    const vside = below >= above ? 'bottom' : 'top';
    const vspace = Math.max(below, above);
    if (vspace >= MIN_VERT) {
      const top = vside === 'bottom' ? r.bottom + GAP : r.top - GAP - Math.min(ch, vspace);
      setPos({ mode: 'anchor', side: vside, top: clampTop(top), left: clampLeft(r.left + r.width / 2 - cw / 2), maxH: vspace });
      return;
    }
    const hside = right >= left ? 'right' : 'left';
    const hspace = Math.max(right, left);
    if (hspace >= MIN_HORIZ) {
      const leftX = hside === 'right' ? r.right + GAP : r.left - GAP - cw;
      setPos({ mode: 'anchor', side: hside, top: clampTop(r.top + r.height / 2 - ch / 2), left: leftX, maxH: vh - 2 * PAD });
      return;
    }
    setPos({ mode: 'center' });
  };

  // Drive the page for each step, then measure once layout settles.
  createEffect(() => {
    const s = step();
    setTutorialHeader(!!s.header);
    if (s.note) openTutorialNote(s.note); else closeTutorialNote();
    setPos(null);
    requestAnimationFrame(() => requestAnimationFrame(() => measure()));
    // Expand the in-note Q&A panel so its real suggested questions show. Runs
    // once per step entry (after the note has had a beat to render); the
    // collapsed-state guard keeps repeated measures from toggling it shut.
    if (s.expandQa) {
      const tryExpand = (n = 0) => {
        const toggle = document.querySelector<HTMLButtonElement>('[data-tour="argument-qa"] button[aria-expanded]');
        if (toggle) {
          if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
          requestAnimationFrame(() => measure());
        } else if (n < 20) {
          setTimeout(() => tryExpand(n + 1), 150);
        }
      };
      setTimeout(() => tryExpand(), 400);
    }
  });

  // Keep the cutout glued to the target through scroll / resize.
  createEffect(() => {
    const onMove = () => requestAnimationFrame(() => measure());
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    onCleanup(() => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    });
  });

  // Leaving the tour: restore the reader's chrome.
  onCleanup(() => { closeTutorialNote(); setTutorialHeader(false); });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const rtl = lang() === 'he';
      if (e.key === 'ArrowRight') rtl ? back() : next();
      else if (e.key === 'ArrowLeft') rtl ? next() : back();
      else if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  const hasRing = () => !!rect();

  const cardStyle = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = {
      position: 'fixed',
      'z-index': '6002',
      'box-sizing': 'border-box',
      'pointer-events': 'auto',
      display: 'flex',
      'flex-direction': 'column',
      background: '#fff',
      border: '1px solid var(--line, #e5e3dc)',
      'box-shadow': '0 12px 40px rgba(0,0,0,0.22)',
    };
    if (isMobile()) {
      const atTop = mobileAnchor() === 'top';
      return {
        ...base,
        left: '8px',
        right: '8px',
        [atTop ? 'top' : 'bottom']: atTop ? 'calc(8px + env(safe-area-inset-top))' : `calc(${MOBILE_BAR}px + env(safe-area-inset-bottom))`,
        'max-height': '46vh',
        'border-radius': '12px',
        overflow: 'hidden',
      };
    }
    const p = pos();
    const anchored = p?.mode === 'anchor' ? p : null;
    return {
      ...base,
      width: 'min(380px, calc(100vw - 24px))',
      'border-radius': '10px',
      ...(anchored
        ? { top: `${anchored.top}px`, left: `${anchored.left}px`, 'max-height': `${Math.max(MIN_VERT, anchored.maxH)}px` }
        : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 'max-height': 'calc(100vh - 24px)' }),
      opacity: pos() ? '1' : '0',
      transition: 'opacity 0.15s ease, top 0.2s ease, left 0.2s ease',
    };
  };

  return (
    <Portal>
      {/* Click shield — a transparent full-viewport layer that swallows every
          interaction with the daf during the tour, so clicking the page can't
          start a selection or open an unrelated note. The coach drives
          everything; the shield sits below the ring/dim (visual only) and the
          card (which is above it and stays interactive). */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: '0', 'z-index': '5999', background: 'transparent' }} />

      {/* Backdrop. A target step dims everything except a ring around the real
          element (via the ring's huge box-shadow); a concept step dims
          uniformly. Both are visual only (pointer-events:none) — the shield
          above does the blocking. */}
      <Show
        when={hasRing()}
        fallback={<div aria-hidden="true" style={{ position: 'fixed', inset: '0', 'z-index': '6000', 'pointer-events': 'none', background: 'rgba(17,24,39,0.55)' }} />}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: `${rect()!.top - 6}px`,
            left: `${rect()!.left - 6}px`,
            width: `${rect()!.width + 12}px`,
            height: `${rect()!.height + 12}px`,
            'border-radius': '8px',
            'box-shadow': '0 0 0 9999px rgba(17,24,39,0.55), 0 0 0 2px rgba(255,255,255,0.9), 0 0 0 5px var(--accent, #8a2a2b)',
            'z-index': '6000',
            'pointer-events': 'none',
            transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
          }}
        />
      </Show>

      <div ref={cardEl} style={cardStyle()}>
        <div style={{ padding: '18px 20px 0', 'overflow-y': 'auto', flex: '1 1 auto' }}>
          <div style={{ display: 'flex', 'align-items': 'baseline', 'justify-content': 'space-between', gap: '12px', 'margin-bottom': '6px' }}>
            <span style={{ 'font-size': '11px', 'letter-spacing': '0.05em', 'text-transform': 'uppercase', color: 'var(--muted, #6b7280)', 'font-weight': 600 }}>
              {t(step().chapterKey)}
            </span>
            <span style={{ 'font-size': '11px', color: 'var(--muted, #6b7280)', 'white-space': 'nowrap' }}>
              {t('tutorial.progress', { n: i() + 1, total })}
            </span>
          </div>
          <div style={{ 'font-size': '18px', 'font-weight': 700, 'margin-bottom': '8px', color: 'var(--fg, #111827)', 'line-height': 1.25 }}>
            {t(step().titleKey)}
          </div>
          <div style={{ 'font-size': '14px', 'line-height': 1.55, color: '#374151' }}>
            {t(step().bodyKey)}
          </div>
          <Show when={step().supplement}>
            {(kind) => <Supplement kind={kind()} />}
          </Show>
          <Show when={step().note}>
            <div style={{ 'margin-top': '12px', 'font-size': '12px', 'line-height': 1.45, color: 'var(--muted, #6b7280)', 'font-style': 'italic' }}>
              {t('tutorial.generating.note')}
            </div>
          </Show>
          <Show when={step().id === 'finish'}>
            <div style={{ 'margin-top': '14px', 'font-size': '14px', 'line-height': 1.55, color: '#374151' }}>
              {t('tutorial.finish.contact')}{' '}
              <a href="mailto:shaunregenbaum@gmail.com" style={{ color: 'var(--accent, #8a2a2b)', 'font-weight': 600 }}>
                shaunregenbaum@gmail.com
              </a>
            </div>
          </Show>
        </div>

        <div style={{ padding: '12px 20px 16px', 'border-top': '1px solid #f1efea', flex: '0 0 auto' }}>
          <Dots index={i()} onJump={setI} />
          <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '8px', 'margin-top': '12px' }}>
            <Show when={!isLast()} fallback={<span />}>
              <button type="button" onClick={finish} style={linkBtn()}>{t('tutorial.skip')}</button>
            </Show>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Show when={i() > 0}>
                <button type="button" onClick={back} style={ghostBtn()}>{t('tutorial.back')}</button>
              </Show>
              <button type="button" onClick={next} style={primaryBtn()}>
                {isLast() ? t('tutorial.done') : t('tutorial.next')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function Dots(props: { index: number; onJump: (i: number) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '6px', 'justify-content': 'center' }}>
      <For each={TOUR_STEPS}>
        {(_, idx) => (
          <button
            type="button"
            aria-label={`${idx() + 1}`}
            aria-current={idx() === props.index ? 'step' : undefined}
            onClick={() => props.onJump(idx())}
            style={{ padding: 0, border: 'none', cursor: 'pointer', background: 'transparent', 'line-height': 0 }}
          >
            <span
              style={{
                display: 'block',
                width: idx() === props.index ? '18px' : '7px',
                height: '7px',
                'border-radius': '4px',
                background: idx() === props.index ? 'var(--accent, #8a2a2b)' : '#d1d5db',
                transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          </button>
        )}
      </For>
    </div>
  );
}

function primaryBtn(): JSX.CSSProperties {
  return {
    background: 'var(--accent, #8a2a2b)', color: '#fff', border: '1px solid var(--accent, #8a2a2b)',
    'border-radius': '6px', padding: '9px 18px', 'font-size': '14px',
    'font-weight': 600, cursor: 'pointer', 'white-space': 'nowrap',
  };
}
function ghostBtn(): JSX.CSSProperties {
  return {
    background: '#fff', color: '#374151', border: '1px solid var(--line, #d1d5db)',
    'border-radius': '6px', padding: '9px 14px', 'font-size': '14px',
    cursor: 'pointer', 'white-space': 'nowrap',
  };
}
function linkBtn(): JSX.CSSProperties {
  return {
    background: 'transparent', color: 'var(--muted, #6b7280)', border: 'none',
    padding: '9px 4px', 'font-size': '14px', cursor: 'pointer', 'white-space': 'nowrap',
  };
}

// ---------------------------------------------------------------------------
// Supplements — small legends drawn under a concept step's body.
// ---------------------------------------------------------------------------

const MARK_KINDS: { kind: GutterKind; labelKey: string; descKey: string }[] = [
  { kind: 'argument', labelKey: 'tutorial.icon.argument.label', descKey: 'tutorial.icon.argument.desc' },
  { kind: 'halacha', labelKey: 'tutorial.icon.halacha.label', descKey: 'tutorial.icon.halacha.desc' },
  { kind: 'aggadata', labelKey: 'tutorial.icon.aggadata.label', descKey: 'tutorial.icon.aggadata.desc' },
  { kind: 'yerushalmi', labelKey: 'tutorial.icon.yerushalmi.label', descKey: 'tutorial.icon.yerushalmi.desc' },
  { kind: 'pesuk', labelKey: 'tutorial.icon.pesuk.label', descKey: 'tutorial.icon.pesuk.desc' },
  { kind: 'rishonim', labelKey: 'tutorial.icon.rishonim.label', descKey: 'tutorial.icon.rishonim.desc' },
];

const EARLY_SAMPLE: GenerationId[] = ['zugim', 'tanna-4', 'amora-bavel-4', 'savora'];
const LATE_SAMPLE: GenerationId[] = ['geonim', 'rishonim', 'achronim'];

function Supplement(props: { kind: TourSupplement }): JSX.Element {
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
                    width: '22px', height: '22px', 'border-radius': '50%', flex: '0 0 auto', 'margin-top': '1px',
                    background: colorForKind(m.kind), color: '#fff',
                  }}
                >
                  <GutterGlyph kind={m.kind} />
                </span>
                <span style={{ 'font-size': '13.5px', color: '#374151', 'line-height': 1.4 }}>
                  <b style={{ color: 'var(--fg, #111827)' }}>{t(m.labelKey)}</b> — {t(m.descKey)}
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
            <span style={{ 'font-size': '15px', 'border-bottom': '2px dotted #6b7280', 'padding-bottom': '1px', color: '#374151' }}>הֶקֵּשׁ</span>
            <span style={{ 'font-size': '12px', color: 'var(--muted, #6b7280)' }}>{t('tutorial.underline.dotted')}</span>
          </div>
        </div>
      </Show>

      <Show when={props.kind === 'translate-word'}>
        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '10px', 'font-size': '17px' }}>
          <span style={{ 'border-bottom': '2px solid var(--accent, #8a2a2b)', 'padding-bottom': '1px' }}>גַּבְרָא</span>
          <span style={{ color: '#9ca3af' }}>→</span>
          <span style={transChip()}>{t('tutorial.translateWord.example')}</span>
        </div>
      </Show>

      <Show when={props.kind === 'translate-phrase'}>
        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '10px', 'font-size': '17px', 'flex-wrap': 'wrap' }}>
          <span dir="rtl" style={{ 'border-bottom': '2px solid var(--accent, #8a2a2b)', 'padding-bottom': '1px' }}>{t('tutorial.translatePhrase.exampleHe')}</span>
          <span style={{ color: '#9ca3af' }}>→</span>
          <span style={transChip()}>{t('tutorial.translatePhrase.exampleEn')}</span>
        </div>
      </Show>

      <Show when={props.kind === 'qa'}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
            <span style={qaPill()}>{t('tutorial.qa.example1')}</span>
            <span style={qaPill()}>{t('tutorial.qa.example2')}</span>
          </div>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', border: '1px solid var(--line, #d1d5db)', 'border-radius': '4px', padding: '8px 11px', 'font-size': '13px', color: '#9ca3af', background: '#fbfaf8' }}>
            <span style={{ flex: '1 1 auto' }}>{t('tutorial.qa.placeholder')}</span>
            <span style={{ color: 'var(--accent, #8a2a2b)', 'font-weight': 700 }}>↵</span>
          </div>
        </div>
      </Show>
    </div>
  );
}

function transChip(): JSX.CSSProperties {
  return {
    background: '#f3eceb', border: '1px solid #e3cfcf', 'border-radius': '4px',
    padding: '3px 12px', 'font-size': '15px', color: 'var(--accent-strong, #6f2122)',
  };
}
function qaPill(): JSX.CSSProperties {
  return {
    'font-size': '12px', background: '#f3eceb', color: 'var(--accent-strong, #6f2122)',
    border: '1px solid #e3cfcf', 'border-radius': '999px', padding: '3px 10px', 'white-space': 'nowrap',
  };
}
function SpectrumRow(props: { labelKey: string; ids: GenerationId[] }): JSX.Element {
  return (
    <div>
      <div style={{ 'font-size': '12px', color: 'var(--muted, #6b7280)', 'margin-bottom': '5px' }}>{t(props.labelKey)}</div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <For each={props.ids}>
          {(id) => {
            const bg = colorForGeneration(id);
            return (
              <span style={{ display: 'inline-block', height: '16px', flex: '1 1 0', background: bg, 'border-radius': '2px', color: legibleTextColor(bg) }} />
            );
          }}
        </For>
      </div>
    </div>
  );
}
