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
  triggerTutorialTranslate,
  setTutorialPrefetch,
  type TourSupplement,
} from './tutorial';
import { GutterGlyph, colorForKind, type GutterKind } from './GutterIcons';
import { colorForGeneration, legibleTextColor, type GenerationId } from './generations';

const GAP = 14;
const PAD = 12;
const MIN_VERT = 200;
const MIN_HORIZ = 320;
const MOBILE_BAR = 72; // room left for the mobile mode bar at the very bottom

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
  // The visible band of the (possibly pinch-zoomed / URL-bar-shifted) viewport.
  // On mobile, `position:fixed` paints relative to the layout viewport, so when
  // the user has zoomed or the browser chrome has slid the visual viewport, we
  // pin the sheet to this band instead — otherwise it drifts off-screen.
  const [vp, setVp] = createSignal({
    top: 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    scale: 1,
  });
  const readVp = () => {
    const v = typeof window !== 'undefined' ? window.visualViewport : null;
    setVp(v ? { top: v.offsetTop, height: v.height, scale: v.scale } : { top: 0, height: window.innerHeight, scale: 1 });
  };
  let cardEl: HTMLDivElement | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    closeTutorialNote();
    setTutorialHeader(false);
    triggerTutorialTranslate('clear');
    markCompleted();
    window.location.hash = 'daf';
  };
  const next = () => (isLast() ? finish() : setI(i() + 1));
  const back = () => setI(Math.max(0, i() - 1));

  // Where the mobile sheet sits: away from what the step occupies.
  const mobileAnchor = (): 'top' | 'bottom' => (step().note ? 'top' : 'bottom');

  // The mobile daf keeps a sticky "Menu" handle pinned to the very top of the
  // viewport. Anything scrolled to y=0 hides *behind* it (z-index 60) — which
  // is exactly what buried the language toggle. This returns the viewport y
  // below which a spotlit element is genuinely visible (handle bottom + air).
  const mobileTopInset = () => {
    const handle = document.querySelector<HTMLElement>('.daf-header-handle');
    return (handle ? handle.getBoundingClientRect().bottom : 0) + GAP;
  };

  // Watch the spotlit element for size changes (a note panel grows as its
  // content loads) and re-measure, so the ring waits for the panel to populate
  // instead of locking onto its empty, pre-load size.
  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => requestAnimationFrame(() => measure(0, true)))
    : null;
  let observed: Element | null = null;

  const measure = (attempt = 0, fromObserver = false) => {
    if (!fromObserver) clearTimeout(retryTimer);
    const s = step();
    const sel = s.selector ?? (s.target ? `[data-tour="${s.target}"]` : null);
    if (!sel) { setRect(null); reposition(); return; }
    const all = Array.from(document.querySelectorAll<HTMLElement>(sel));
    if (!all.length) {
      setRect(null);
      reposition();
      // Marks / notes load async — keep looking for a few seconds, then settle
      // into the centered fallback if the target genuinely never appears.
      if (!fromObserver && attempt < 30) retryTimer = setTimeout(() => measure(attempt + 1), 120);
      return;
    }
    // Which match(es) to ring: a specific index (e.g. a rabbi name from the
    // body), else the union of all matches (e.g. every word of a phrase).
    let targets = all;
    if (s.selectorIndex === 'middle') targets = [all[Math.floor(all.length / 2)]];
    else if (typeof s.selectorIndex === 'number') targets = [all[Math.max(0, Math.min(s.selectorIndex, all.length - 1))]];

    const lead = targets[0];
    // Observe the element so we re-measure when it grows (content populates).
    if (observed !== lead) { if (observed) ro?.unobserve(observed); ro?.observe(lead); observed = lead; }
    // Scroll the target into the area the card won't cover (skip when the
    // re-measure was triggered by a resize, to avoid scroll fights). On mobile
    // the bottom-sheet steps must clear the sticky header handle: a naive
    // scrollIntoView({block:'start'}) tucks the target *under* it (this is what
    // hid the language toggle), so we scroll manually to land the target in the
    // free strip just below the handle.
    if (!fromObserver) {
      if (isMobile() && mobileAnchor() === 'bottom') {
        const y = window.scrollY + lead.getBoundingClientRect().top - mobileTopInset() - GAP;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      } else {
        lead.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      }
    }
    // Union bounding box of the targets — the whole note panel (it's measured
    // after the content populates, via the ResizeObserver + settle re-measures
    // below), the rabbi name, or the word + its translation popup.
    const rs = targets.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left));
    const top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    setRect(new DOMRect(left, top, right - left, bottom - top));
    reposition();
  };
  onCleanup(() => { clearTimeout(retryTimer); ro?.disconnect(); });

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

  // Drive the page for each step, then measure once layout settles. Only
  // open/close a note when the kind actually changes between steps — so the
  // Q&A step (same argument note as the previous step) doesn't remount the
  // panel and lose the expanded state we're about to spotlight.
  let prevNote: string | undefined;
  let prevTranslate: string | undefined;
  createEffect(() => {
    const s = step();
    setTutorialHeader(!!s.header);
    if (s.note !== prevNote) {
      if (s.note) openTutorialNote(s.note); else closeTutorialNote();
      prevNote = s.note;
    }
    // Fire (or clear) a real translation on the daf for the translate steps.
    if (s.translate !== prevTranslate) {
      if (s.translate) triggerTutorialTranslate(s.translate);
      else if (prevTranslate) triggerTutorialTranslate('clear');
      prevTranslate = s.translate;
    }
    setPos(null);
    requestAnimationFrame(() => requestAnimationFrame(() => measure()));
    // Content (notes, the translation popup) and any autoscroll settle async —
    // re-measure a few times so the ring lands on the populated, settled target
    // instead of its empty pre-load size.
    for (const ms of [250, 600, 1200, 2200]) setTimeout(() => measure(0, true), ms);
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

  // Keep the cutout + sheet glued to the target through scroll / resize — and,
  // on mobile, through pinch-zoom and the URL-bar show/hide, which fire on the
  // visualViewport (not window) and move where "fixed" actually paints.
  createEffect(() => {
    const onMove = () => requestAnimationFrame(() => { readVp(); measure(); });
    readVp();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    const v = typeof window !== 'undefined' ? window.visualViewport : null;
    v?.addEventListener('resize', onMove);
    v?.addEventListener('scroll', onMove);
    onCleanup(() => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      v?.removeEventListener('resize', onMove);
      v?.removeEventListener('scroll', onMove);
    });
  });

  // Leaving the tour: restore the reader's chrome.
  // While the tour is up, QAPanels pre-warm a few suggested answers so the Q&A
  // step's questions click through instantly.
  setTutorialPrefetch(true);
  onCleanup(() => { closeTutorialNote(); setTutorialHeader(false); triggerTutorialTranslate('clear'); setTutorialPrefetch(false); });

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
      const v = vp();
      // When the visual viewport is zoomed or shifted away from the layout
      // viewport, "fixed" no longer lines up with what the user sees, so pin
      // the sheet to the visible band explicitly. Otherwise keep the simple
      // CSS anchoring (which honours the safe-area insets).
      const shifted = v.scale > 1.01 || Math.abs(v.top) > 1;
      if (shifted) {
        const maxH = `${Math.round(v.height * 0.46)}px`;
        return {
          ...base,
          left: '8px',
          right: '8px',
          'max-height': maxH,
          'border-radius': '12px',
          overflow: 'hidden',
          ...(atTop
            ? { top: `${Math.round(v.top + 8)}px` }
            : { top: `${Math.round(v.top + v.height - MOBILE_BAR)}px`, transform: 'translateY(-100%)' }),
        };
      }
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
          <Show when={step().id === 'finish'}>
            <div style={{ 'margin-top': '14px', 'font-size': '14px', 'line-height': 1.55, color: '#374151' }}>
              {t('tutorial.finish.contact')}{' '}
              <a href="mailto:shaunregenbaum@gmail.com" style={{ color: 'var(--accent, #8a2a2b)', 'font-weight': 600 }}>
                shaunregenbaum@gmail.com
              </a>
            </div>
          </Show>
        </div>

        <div style={{ padding: '14px 20px 22px', 'border-top': '1px solid #f1efea', flex: '0 0 auto' }}>
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
