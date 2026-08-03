/**
 * TermedProse — the parsha drawer's reading-prose block: the shared Prose
 * treatment (language preference + fallback, direction, reading fonts via
 * .ui-prose) plus the Talmud reader's term convention — Hebrew script inline
 * in the English prose, dotted-underlined, with the English hint one hover
 * (or focus) away. Hebrew-mode prose renders plain: it has no glosses to
 * surface, matching the talmud convention that Hebrew is the base there.
 *
 * Matching is by the terms' Hebrew surfaces only (see tokenizeTermMentions);
 * Hebrew runs the pool doesn't know (verse quotes) still get bidi-isolated in
 * a <bdi> so surrounding English punctuation keeps its position.
 */
import { createSignal, For, type JSX, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { type ParshaTerm, tokenizeTermMentions } from '../lib/parsha.ts';

// A maximal Hebrew run — letters plus internal maqaf/geresh/gershayim/spaces,
// starting and ending on a Hebrew character — isolated in a <bdi> so the bidi
// algorithm can't reorder the English punctuation around it.
const HE_RUN = /([֐-׿יִ-ﭏ](?:[֐-׿יִ-ﭏ־׳״' -]*[֐-׿יִ-ﭏ׳״])?)/g;
const isHe = (s: string): boolean => /[֐-׿יִ-ﭏ]/.test(s);

function BidiText(props: { text: string }): JSX.Element {
  const parts = () =>
    props.text
      .split(HE_RUN)
      .filter((part) => part !== '')
      .map((part) => ({ text: part, he: isHe(part) }));
  return <For each={parts()}>{(part) => (part.he ? <bdi>{part.text}</bdi> : part.text)}</For>;
}

export interface TermedProseProps {
  en?: string;
  he?: string;
  /** Preferred language; falls back to the other when the preferred is empty. */
  lang: 'en' | 'he';
  /** The hover-hint pool (Hebrew surface -> short English meaning). */
  terms: readonly ParshaTerm[];
  class?: string;
}

interface TermTip {
  term: ParshaTerm;
  x: number;
  y: number;
  /** Flipped below the term when there's no headroom above it. */
  below: boolean;
}

export function TermedProse(props: TermedProseProps): JSX.Element {
  const shown = (): 'en' | 'he' => {
    if (props.lang === 'he') return props.he ? 'he' : 'en';
    return props.en ? 'en' : 'he';
  };
  const text = (): string => (shown() === 'he' ? props.he : props.en) ?? '';
  // Blank-line paragraphs (the deep-reading producer separates them with one).
  const paragraphs = (): string[] =>
    text()
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

  const [tip, setTip] = createSignal<TermTip | null>(null);
  const showTip = (term: ParshaTerm, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    // Clamp the tooltip's CENTER so its body (max-width 18rem, centered by the
    // -50% transform) stays on-screen — terms sit at line ends inside the
    // fixed right drawer — and flip below the term when there's no headroom.
    const halfWidth = Math.min(144, (window.innerWidth - 32) / 2);
    const x = Math.min(
      Math.max(r.left + r.width / 2, 16 + halfWidth),
      window.innerWidth - 16 - halfWidth,
    );
    const below = r.top < 96;
    setTip({ term, x, y: below ? r.bottom : r.top, below });
  };

  return (
    <>
      <For each={paragraphs()}>
        {(para) => (
          <p
            class="ui-prose"
            classList={props.class ? { [props.class]: true } : undefined}
            dir={shown() === 'he' ? 'rtl' : 'ltr'}
          >
            <Show when={shown() === 'en'} fallback={para}>
              <For each={tokenizeTermMentions(para, props.terms)}>
                {(part) =>
                  part.kind === 'term' && part.term ? (
                    // biome-ignore lint/a11y/useSemanticElements: inline span inside flowing prose; a button element would break text layout and selection/copy (same convention as the talmud reader's ConceptMention)
                    <span
                      class="parsha-term"
                      tabIndex={0}
                      role="button"
                      aria-label={`${part.term.he}: ${part.term.en}`}
                      onMouseEnter={(e) => showTip(part.term as ParshaTerm, e.currentTarget)}
                      onMouseLeave={() => setTip(null)}
                      onFocus={(e) => showTip(part.term as ParshaTerm, e.currentTarget)}
                      onBlur={() => setTip(null)}
                    >
                      {part.value}
                    </span>
                  ) : (
                    <BidiText text={part.value} />
                  )
                }
              </For>
            </Show>
          </p>
        )}
      </For>
      <Show when={tip()}>
        {(t) => (
          <Portal>
            <div
              class="parsha-term-tip"
              classList={{ below: t().below }}
              style={{ left: `${t().x}px`, top: `${t().y + (t().below ? 8 : -8)}px` }}
            >
              <bdi>{t().term.he}</bdi>
              <span>{t().term.en}</span>
            </div>
          </Portal>
        )}
      </Show>
    </>
  );
}
