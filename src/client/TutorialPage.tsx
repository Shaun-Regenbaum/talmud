/**
 * #tutorial — a fully self-contained, step-by-step walkthrough. Unlike the old
 * overlay, nothing here touches the live reader: every step draws its own static
 * mockup, so the page renders identically every time and is laid out on purpose
 * for both desktop (a centered card) and mobile (a full-screen card whose body
 * scrolls and whose footer stays pinned). Done / Skip record completion and
 * return to the reader (#daf).
 *
 * RTL falls out of the document `dir` the i18n layer sets; only the arrow-key
 * mapping branches on language.
 */
import { createSignal, createEffect, onMount, onCleanup, Show, For, type JSX } from 'solid-js';
import { t, lang } from './i18n';
import { TOUR_STEPS, markCompleted, type TourMockup } from './tutorial';
import { GutterGlyph, colorForKind, type GutterKind } from './GutterIcons';
import { colorForGeneration, legibleTextColor, type GenerationId } from './generations';

export function TutorialPage(): JSX.Element {
  const [i, setI] = createSignal(0);
  const total = TOUR_STEPS.length;
  const step = () => TOUR_STEPS[i()];
  const isLast = () => i() >= total - 1;
  let scrollEl: HTMLDivElement | undefined;

  const finish = () => {
    markCompleted();
    window.location.hash = 'daf';
  };
  const next = () => (isLast() ? finish() : setI(i() + 1));
  const back = () => setI(Math.max(0, i() - 1));

  // Reset the body scroll to the top whenever the step changes, so a long step
  // never opens part-scrolled.
  createEffect(() => {
    i();
    scrollEl?.scrollTo(0, 0);
  });

  // Keyboard: arrows page through (flipped in RTL), Escape skips.
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

  return (
    <main class="page-shell tutorial-shell">
      <div class="tutorial-card">
        {/* Scrollable content */}
        <div ref={scrollEl} class="tutorial-body">
          <div style={{ display: 'flex', 'align-items': 'baseline', 'justify-content': 'space-between', gap: '12px', 'margin-bottom': '10px' }}>
            <span style={{ 'font-size': '11px', 'letter-spacing': '0.05em', 'text-transform': 'uppercase', color: 'var(--muted)', 'font-weight': 600 }}>
              {t(step().chapterKey)}
            </span>
            <span style={{ 'font-size': '11px', color: 'var(--muted)', 'white-space': 'nowrap' }}>
              {t('tutorial.progress', { n: i() + 1, total })}
            </span>
          </div>
          <h1 style={{ 'font-size': '22px', 'font-weight': 700, margin: '0 0 10px', color: 'var(--fg)', 'line-height': 1.25 }}>
            {t(step().titleKey)}
          </h1>
          <p style={{ 'font-size': '15px', 'line-height': 1.6, color: '#374151', margin: '0' }}>
            {t(step().bodyKey)}
          </p>
          <Show when={step().mockup}>
            {(kind) => <Mockup kind={kind()} />}
          </Show>
        </div>

        {/* Pinned footer: progress dots + actions */}
        <div class="tutorial-footer">
          <Dots index={i()} onJump={setI} />
          <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '8px', 'margin-top': '14px' }}>
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
    </main>
  );
}

function Dots(props: { index: number; onJump: (i: number) => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '6px', 'justify-content': 'center' }}>
      <For each={TOUR_STEPS}>
        {(s, idx) => (
          <button
            type="button"
            aria-label={`${idx() + 1}`}
            aria-current={idx() === props.index ? 'step' : undefined}
            onClick={() => props.onJump(idx())}
            style={{
              padding: '0', border: 'none', cursor: 'pointer', background: 'transparent',
              'line-height': 0,
            }}
          >
            <span
              style={{
                display: 'block',
                width: idx() === props.index ? '18px' : '7px',
                height: '7px',
                'border-radius': '4px',
                background: idx() === props.index ? 'var(--accent)' : '#d1d5db',
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
    background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)',
    'border-radius': '4px', padding: '9px 18px', 'font-size': '14px',
    'font-weight': 600, cursor: 'pointer', 'white-space': 'nowrap',
  };
}
function ghostBtn(): JSX.CSSProperties {
  return {
    background: '#fff', color: '#374151', border: '1px solid var(--line)',
    'border-radius': '4px', padding: '9px 14px', 'font-size': '14px',
    cursor: 'pointer', 'white-space': 'nowrap',
  };
}
function linkBtn(): JSX.CSSProperties {
  return {
    background: 'transparent', color: 'var(--muted)', border: 'none',
    padding: '9px 4px', 'font-size': '14px', cursor: 'pointer', 'white-space': 'nowrap',
  };
}

// ---------------------------------------------------------------------------
// Mockups — self-contained visuals drawn under a step's body. The four
// "legend / gesture" ones (icons, spectrum, translate, qa) were lifted from the
// retired TutorialOverlay; the four "chrome" ones (lang, nav, chips, card)
// stand in for the reader controls the old tour used to spotlight live.
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

function Mockup(props: { kind: TourMockup }): JSX.Element {
  return (
    <div style={{ 'margin-top': '18px' }}>
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
                  <b style={{ color: 'var(--fg)' }}>{t(m.labelKey)}</b> — {t(m.descKey)}
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
            <span style={{ 'font-size': '12px', color: 'var(--muted)' }}>{t('tutorial.underline.dotted')}</span>
          </div>
        </div>
      </Show>

      <Show when={props.kind === 'translate'}>
        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '10px', 'font-size': '17px' }}>
          <span style={{ 'border-bottom': '2px solid var(--accent)', cursor: 'pointer', 'padding-bottom': '1px' }}>גַּבְרָא</span>
          <span style={{ color: '#9ca3af' }}>→</span>
          <span style={{ background: '#f3eceb', border: '1px solid #e3cfcf', 'border-radius': '4px', padding: '3px 12px', 'font-size': '15px', color: 'var(--accent-strong)' }}>{t('tutorial.translate.example')}</span>
        </div>
      </Show>

      <Show when={props.kind === 'qa'}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
            <span style={pill()}>{t('tutorial.qa.example1')}</span>
            <span style={pill()}>{t('tutorial.qa.example2')}</span>
          </div>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', border: '1px solid var(--line)', 'border-radius': '4px', padding: '8px 11px', 'font-size': '13px', color: '#9ca3af', background: '#fbfaf8' }}>
            <span style={{ flex: '1 1 auto' }}>{t('tutorial.qa.placeholder')}</span>
            <span style={{ color: 'var(--accent)', 'font-weight': 700 }}>↵</span>
          </div>
        </div>
      </Show>

      <Show when={props.kind === 'lang'}>
        <div style={{ display: 'flex', 'justify-content': 'center' }}>
          <div class="tb-seg" role="group" aria-hidden="true">
            <button type="button" class="tb-seg-btn is-active" tabindex="-1">EN</button>
            <button type="button" class="tb-seg-btn" tabindex="-1">עב</button>
          </div>
        </div>
      </Show>

      <Show when={props.kind === 'nav'}>
        <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '0.6rem', 'flex-wrap': 'wrap' }} aria-hidden="true">
          <div class="tb-nav">
            <button type="button" class="tb-navbtn" tabindex="-1">‹</button>
            <span class="tb-daf" style={{ display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', width: 'auto', padding: '0 0.6rem' }}>Berakhot</span>
            <span class="tb-amud" style={{ display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', padding: '0 0.5rem' }}>2a</span>
            <button type="button" class="tb-navbtn" tabindex="-1">›</button>
          </div>
          <button type="button" class="tb-primary" tabindex="-1">{t('header.todaysDaf')}</button>
        </div>
      </Show>

      <Show when={props.kind === 'chips'}>
        <div style={{ display: 'flex', 'justify-content': 'center', gap: '0.4rem', 'flex-wrap': 'wrap' }} aria-hidden="true">
          <span style={chip()}>{t('overview.chip')}</span>
          <span style={chip()}>{t('background.chip')}</span>
          <span style={chip()}>{t('tidbit.chip')}</span>
        </div>
      </Show>

      <Show when={props.kind === 'card'}>
        <div
          aria-hidden="true"
          style={{
            border: '1px solid var(--line)', 'border-radius': '6px', overflow: 'hidden',
            background: '#fff', 'box-shadow': '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ padding: '11px 13px', background: '#faf8f6', 'border-bottom': '1px solid var(--line)' }}>
            <div style={{ 'font-size': '13px', 'font-weight': 700, color: 'var(--fg)', 'margin-bottom': '3px' }}>{t('tutorial.cardmock.summary.title')}</div>
            <div style={{ 'font-size': '12px', color: 'var(--muted)', 'line-height': 1.45 }}>{t('tutorial.cardmock.summary.body')}</div>
          </div>
          <CardMockRow label={t('tutorial.cardmock.section.players')} open />
          <CardMockRow label={t('tutorial.cardmock.section.terms')} />
          <CardMockRow label={t('tutorial.cardmock.section.sources')} />
          <div style={{ padding: '8px 13px', 'font-size': '11px', color: 'var(--muted)', 'border-top': '1px dashed var(--line)', display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <span style={{ width: '18px', height: '10px', 'border-radius': '2px', background: 'rgba(138,42,43,0.18)', 'flex': '0 0 auto' }} />
            {t('tutorial.cardmock.highlight')}
          </div>
        </div>
      </Show>
    </div>
  );
}

function CardMockRow(props: { label: string; open?: boolean }): JSX.Element {
  return (
    <div style={{ padding: '9px 13px', 'border-bottom': '1px solid #f1efea', display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '8px' }}>
      <span style={{ 'font-size': '12.5px', color: 'var(--fg)', 'font-weight': props.open ? 600 : 400 }}>{props.label}</span>
      <span style={{ 'font-size': '12px', color: 'var(--muted)' }}>{props.open ? '▾' : '›'}</span>
    </div>
  );
}

function pill(): JSX.CSSProperties {
  return {
    'font-size': '12px', background: '#f3eceb', color: 'var(--accent-strong)',
    border: '1px solid #e3cfcf', 'border-radius': '999px', padding: '3px 10px', 'white-space': 'nowrap',
  };
}
function chip(): JSX.CSSProperties {
  return {
    'font-size': '12.5px', background: '#fff', color: 'var(--accent-strong)',
    border: '1px solid #e3cfcf', 'border-radius': '999px', padding: '4px 13px', 'white-space': 'nowrap',
  };
}
function SpectrumRow(props: { labelKey: string; ids: GenerationId[] }): JSX.Element {
  return (
    <div>
      <div style={{ 'font-size': '12px', color: 'var(--muted)', 'margin-bottom': '5px' }}>{t(props.labelKey)}</div>
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
