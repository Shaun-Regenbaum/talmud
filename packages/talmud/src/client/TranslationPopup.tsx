import { createEffect, createSignal, type JSX, onCleanup, Show } from 'solid-js';
import { lang, t } from './i18n';

type Rect = { top: number; left: number; bottom: number; right: number };

export interface TranslationPopupProps {
  word: string;
  tractate: string;
  page: string;
  anchor: Rect;
  onClose: () => void;
  /** ~30 words of daf text immediately before the click, used by the server
   *  to align to a Sefaria segment and pick a contextually-correct translation. */
  hebrewBefore?: string;
  /** ~30 words of daf text immediately after the click. */
  hebrewAfter?: string;
  /** Sefaria segment index resolved client-side from `data-seg` on the
   *  clicked .daf-word. The server uses it directly when provided. */
  segIdx?: number;
  /** Mobile mode: always place the popup ABOVE the selected words (never over
   *  them) and auto-scroll the page to make room if needed, so the reader can
   *  always see the words and tap nearby ones to extend the selection. Also
   *  shows the tap-to-extend hint. */
  mobile?: boolean;
  /** Live bounding rect of the selected word(s) in viewport coords. Used on
   *  mobile to re-measure after an auto-scroll (the static `anchor` goes stale
   *  once we scroll). Falls back to `anchor` when absent. */
  getAnchorRect?: () => Rect | null;
  /** Max words a tap-to-extend region can span (mobile hint copy). */
  maxWords?: number;
}

// Module-level cache so reopening the popup for a word we already translated
// skips the network call entirely.
const localCache = new Map<string, string>();

export function TranslationPopup(props: TranslationPopupProps): JSX.Element {
  const [translation, setTranslation] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  let popupRef: HTMLDivElement | undefined;

  // Cache key includes a cheap hash of the surrounding text so the same word
  // in two different passages gets two separate translations.
  const ctxHash = (s: string): string => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  // Key by target language too — an English and a Hebrew gloss of the same word
  // are distinct cached answers (mirrors the server's per-lang cache key).
  const cacheKey = () =>
    `${lang()}:${props.tractate}:${props.page}:${props.word}:${ctxHash((props.hebrewBefore ?? '') + '|' + (props.hebrewAfter ?? ''))}`;

  createEffect(() => {
    const key = cacheKey();
    const cached = localCache.get(key);
    if (cached !== undefined) {
      setTranslation(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setTranslation(null);

    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: props.word,
        tractate: props.tractate,
        page: props.page,
        hebrewBefore: props.hebrewBefore,
        hebrewAfter: props.hebrewAfter,
        segIdx: props.segIdx,
        lang: lang(),
      }),
    })
      .then((r) => r.json() as Promise<{ translation: string; cached?: boolean; error?: string }>)
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }
        localCache.set(key, data.translation);
        setTranslation(data.translation);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  });

  // Dismiss on Escape or outside click
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
  };
  const onDocClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (popupRef && popupRef.contains(target)) return;
    // A tap on another daf word should retarget/extend the selection (handled
    // by the viewer's mouseup), not dismiss the popup — otherwise mobile
    // tap-to-extend would clear the anchor before the second tap registers.
    if (target?.closest('.daf-word')) return;
    props.onClose();
  };
  window.addEventListener('keydown', onKey);
  // Use capture so we beat the viewer's own click handler on `.daf-word`
  document.addEventListener('mousedown', onDocClick, true);
  onCleanup(() => {
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('mousedown', onDocClick, true);
  });

  const GAP = 8; // space between popup and the selected words
  const TOP_MARGIN = 8; // min gap from the viewport top
  const SIDE_MARGIN = 8; // min gap from the viewport sides

  const liveAnchor = (): Rect => props.getAnchorRect?.() ?? props.anchor;

  // Keep the popup on-screen horizontally. It's centred on the word via
  // translateX(-50%), so a word near either edge would otherwise push half the
  // popup off-screen (badly so for the wide Hebrew column). Clamp the centre so
  // both edges stay inside the viewport; if the popup is wider than the
  // viewport, just centre it.
  const clampCenterX = (center: number): number => {
    const w = popupRef?.offsetWidth ?? 240;
    const vw = window.innerWidth;
    const half = w / 2;
    if (w + 2 * SIDE_MARGIN >= vw) return vw / 2;
    return Math.min(Math.max(center, half + SIDE_MARGIN), vw - half - SIDE_MARGIN);
  };

  // — Desktop: above if there's room, else below (static, from the click anchor).
  const popupStyle = (): JSX.CSSProperties => {
    const a = props.anchor;
    const popupHeight = 80;
    const above = a.top > popupHeight + 16;
    const top = above ? a.top - popupHeight - 8 : a.bottom + 8;
    const centerX = (a.left + a.right) / 2;
    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${clampCenterX(centerX)}px`,
      transform: 'translateX(-50%)',
      'z-index': '1000',
    };
  };

  // — Mobile: always above the words. If there isn't room above, scroll the
  // page so the words drop down (revealing space), then re-measure. Keeps the
  // selected text visible so the reader can tap adjacent words to extend.
  const [mobilePos, setMobilePos] = createSignal<{ top: number; left: number } | null>(null);
  const placeAbove = (allowScroll: boolean) => {
    const a = liveAnchor();
    const h = popupRef?.offsetHeight ?? 80;
    const deficit = TOP_MARGIN + h + GAP - a.top;
    if (allowScroll && deficit > 0) {
      // Scroll up (content moves down) by the deficit, then re-measure the now
      // lower selection on the next frame — without scrolling again.
      window.scrollBy({ top: -deficit });
      requestAnimationFrame(() => placeAbove(false));
    }
    setMobilePos({
      top: Math.max(TOP_MARGIN, a.top - h - GAP),
      left: clampCenterX((a.left + a.right) / 2),
    });
  };
  // Reposition (with a scroll if needed) whenever the selection changes.
  createEffect(() => {
    if (!props.mobile) return;
    void props.anchor; // re-run when the selection identity changes
    placeAbove(true);
  });
  // Re-place (no scroll) when the popup's height changes as the translation
  // text arrives, so it stays glued just above the words.
  createEffect(() => {
    if (!props.mobile) return;
    void translation();
    void loading();
    void error();
    placeAbove(false);
  });

  const positionStyle = (): JSX.CSSProperties => {
    if (!props.mobile) return popupStyle();
    const p = mobilePos();
    const a = liveAnchor();
    const top = p ? p.top : Math.max(TOP_MARGIN, a.top - 80 - GAP);
    const left = p ? p.left : clampCenterX((a.left + a.right) / 2);
    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      transform: 'translateX(-50%)',
      'z-index': '1000',
    };
  };

  return (
    <div
      ref={popupRef}
      class="translation-popup"
      style={{
        ...positionStyle(),
        background: '#fff',
        border: '1px solid #d0d0d0',
        'border-radius': '6px',
        'box-shadow': '0 4px 16px rgba(0, 0, 0, 0.12)',
        padding: '0.6rem 0.9rem',
        'min-width': '10rem',
        'max-width': '22rem',
        'font-family': 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        dir="rtl"
        lang="he"
        style={{
          'font-family': '"Mekorot Vilna", serif',
          'font-size': '1.2rem',
          'font-weight': 'bold',
          'margin-bottom': '0.25rem',
          color: '#333',
        }}
      >
        {props.word}
      </div>
      <div style={{ 'font-size': '0.95rem', color: '#222', 'min-height': '1.4em' }}>
        <Show when={loading()}>
          <span style={{ color: '#888', 'font-style': 'italic' }}>{t('translation.loading')}</span>
        </Show>
        <Show when={error()}>
          <span style={{ color: '#c33' }}>{error()}</span>
        </Show>
        <Show when={!loading() && !error() && translation()}>{translation()}</Show>
      </div>
      <Show when={props.mobile}>
        <div
          style={{
            'margin-top': '0.4rem',
            'padding-top': '0.35rem',
            'border-top': '1px solid #eee',
            'font-size': '0.7rem',
            color: '#999',
            'line-height': 1.35,
          }}
        >
          {t('translation.mobileHint', { max: props.maxWords ?? 20 })}
        </div>
      </Show>
    </div>
  );
}
