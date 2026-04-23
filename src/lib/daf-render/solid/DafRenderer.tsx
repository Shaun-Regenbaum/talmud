import { createMemo, createSignal, createEffect, Show, type JSX } from 'solid-js';
import { computeLayout, type LayoutResult } from '../core/layout';
import { resolveOptions, type PartialDafOptions } from '../core/options';
import type { Amud } from '../core/types';

import '../styles.css';

export interface DafRendererProps {
  main: string;
  inner: string;
  outer: string;
  amud?: Amud;
  options?: PartialDafOptions;
  onLayout?: (result: LayoutResult) => void;
}

const [fontsReady, setFontsReady] = createSignal(false);
if (typeof document !== 'undefined') {
  // document.fonts.ready only waits for fonts already scheduled to load. On
  // first page load our @font-face rules may not yet be "in use", so it can
  // resolve before Mekorot fonts are actually fetched — leading to layout
  // measurements with fallback font metrics and a broken-looking render that
  // magically fixes on reload (once the fonts are in HTTP cache).
  //
  // Explicitly loading by name forces the browser to fetch those specific
  // fonts at representative sizes, and only flips fontsReady once all are in.
  const fontPromises = [
    '15px "Mekorot Vilna"',
    '10.5px "Mekorot Rashi"',
    '700 15px "Mekorot Vilna"',
    '10.5px "Mekorot Vilna"',
  ].map((spec) => document.fonts.load(spec).catch(() => null));
  Promise.all(fontPromises)
    .then(() => document.fonts.ready)
    .then(() => setFontsReady(true));
}

export function DafRenderer(props: DafRendererProps): JSX.Element {
  const options = createMemo(() => resolveOptions(props.options));

  const layout = createMemo(() => {
    if (!fontsReady()) return null;
    return computeLayout(
      { main: props.main, inner: props.inner, outer: props.outer },
      options(),
      props.amud ?? 'a',
    );
  });

  createEffect(() => {
    const result = layout();
    if (result && props.onLayout) props.onLayout(result);
  });

  const rootStyle = createMemo<JSX.CSSProperties>(() => {
    const opts = options();
    const result = layout();
    const amudB = props.amud === 'b';

    const sidePercent = ((1 - opts.mainWidth) / 2) * 100;
    const halfwayPercent = opts.halfway * 100;
    const remainderPercent = 100 - sidePercent;

    const vars: Record<string, string> = {
      '--daf-content-width': `${opts.contentWidth}px`,
      '--daf-side-percent': `${sidePercent}%`,
      '--daf-halfway-percent': `${halfwayPercent}%`,
      '--daf-remainder-percent': `${remainderPercent}%`,
      '--daf-padding-vertical': `${opts.padding.vertical}px`,
      '--daf-padding-horizontal': `${opts.padding.horizontal}px`,
      '--daf-font-main': `"${opts.fontFamily.main}"`,
      '--daf-font-inner': `"${opts.fontFamily.inner}"`,
      '--daf-font-outer': `"${opts.fontFamily.outer}"`,
      '--daf-direction': opts.direction,
      '--daf-font-size-main': `${opts.fontSize.main}px`,
      '--daf-font-size-side': `${opts.fontSize.side}px`,
      '--daf-line-height-main': `${opts.lineHeight.main}px`,
      '--daf-line-height-side': `${opts.lineHeight.side}px`,
      '--daf-inner-float': amudB ? 'right' : 'left',
      '--daf-outer-float': amudB ? 'left' : 'right',
      '--daf-start': `${result?.spacers.start ?? 0}px`,
      '--daf-inner': `${result?.spacers.inner ?? 0}px`,
      '--daf-outer': `${result?.spacers.outer ?? 0}px`,
      '--daf-inner-end': `${result?.spacers.innerEnd ?? 0}px`,
      '--daf-outer-end': `${result?.spacers.outerEnd ?? 0}px`,
    };

    // Exception-case start spacer overrides
    const exc = result?.spacers.exception ?? 0;
    const halfwayStr = `${halfwayPercent}%`;
    const halfPad = `${opts.padding.horizontal / 2}px`;
    const vertGap = `${opts.padding.vertical}px`;
    if (exc === 1) {
      // Inner too short → inner gets full-width start (text pushed below),
      // outer gets zero-width start (text flows at fullwidth in top region).
      vars['--daf-inner-start-width'] = '100%';
      vars['--daf-inner-start-pad'] = '0px';
      vars['--daf-inner-start-gap'] = vertGap;
      vars['--daf-outer-start-width'] = '0%';
      vars['--daf-outer-start-pad'] = '0px';
      vars['--daf-outer-start-gap'] = '0px';
    } else if (exc === 2) {
      vars['--daf-outer-start-width'] = '100%';
      vars['--daf-outer-start-pad'] = '0px';
      vars['--daf-outer-start-gap'] = vertGap;
      vars['--daf-inner-start-width'] = '0%';
      vars['--daf-inner-start-pad'] = '0px';
      vars['--daf-inner-start-gap'] = '0px';
    } else {
      vars['--daf-inner-start-width'] = halfwayStr;
      vars['--daf-inner-start-pad'] = halfPad;
      vars['--daf-inner-start-gap'] = '0px';
      vars['--daf-outer-start-width'] = halfwayStr;
      vars['--daf-outer-start-pad'] = halfPad;
      vars['--daf-outer-start-gap'] = '0px';
    }

    return {
      ...(vars as JSX.CSSProperties),
      height: result ? `${result.totalHeight}px` : 'auto',
    };
  });

  let rootRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!layout() || !rootRef) return;
    queueMicrotask(() => {
      if (!rootRef) return;
      const q = (sel: string) => rootRef!.querySelector(sel) as HTMLElement | null;
      const h = (el: HTMLElement | null) => el ? Math.round(el.getBoundingClientRect().height) : 0;
      const spans = {
        main: h(q('.daf-main .daf-text span')),
        inner: h(q('.daf-inner .daf-text span')),
        outer: h(q('.daf-outer .daf-text span')),
      };
      const spacers = {
        'main-start': h(q('.daf-main .daf-start')),
        'main-inner-mid': h(q('.daf-main .daf-inner-mid')),
        'main-outer-mid': h(q('.daf-main .daf-outer-mid')),
        'inner-mid': h(q('.daf-inner .daf-mid')),
        'outer-mid': h(q('.daf-outer .daf-mid')),
        'inner-end': h(q('.daf-inner .daf-end')),
        'outer-end': h(q('.daf-outer .daf-end')),
      };
      // eslint-disable-next-line no-console
      console.log('[daf-render DOM] spans:', spans, 'spacers:', spacers);
    });
  });

  return (
    <div class="daf-root" style={rootStyle()} ref={rootRef}>
      <Show when={!fontsReady()}>
        <div style={{ padding: '1rem', color: '#888', 'font-style': 'italic' }}>
          Loading fonts…
        </div>
      </Show>

      <div class="daf-outer">
        <div class="daf-spacer daf-start" />
        <div class="daf-spacer daf-mid" />
        <div class="daf-spacer daf-end" />
        <div class="daf-text">
          <span innerHTML={props.outer} />
        </div>
      </div>

      <div class="daf-inner">
        <div class="daf-spacer daf-start" />
        <div class="daf-spacer daf-mid" />
        <div class="daf-spacer daf-end" />
        <div class="daf-text">
          <span innerHTML={props.inner} />
        </div>
      </div>

      <div class="daf-main">
        <div class="daf-spacer daf-start" />
        <div class="daf-spacer daf-inner-mid" />
        <div class="daf-spacer daf-outer-mid" />
        <div class="daf-text">
          <span innerHTML={props.main} />
        </div>
      </div>
    </div>
  );
}
