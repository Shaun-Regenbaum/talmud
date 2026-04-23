import { createSignal, createEffect, onCleanup, Show, type JSX } from 'solid-js';

export interface TranslationPopupProps {
  word: string;
  tractate: string;
  page: string;
  anchor: { top: number; left: number; bottom: number; right: number };
  onClose: () => void;
  /** ~30 words of daf text immediately before the click, used by the server
   *  to align to a Sefaria segment and pick a contextually-correct translation. */
  hebrewBefore?: string;
  /** ~30 words of daf text immediately after the click. */
  hebrewAfter?: string;
  /** Sefaria segment index resolved client-side from `data-seg` on the
   *  clicked .daf-word. The server uses it directly when provided. */
  segIdx?: number;
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
  const cacheKey = () =>
    `${props.tractate}:${props.page}:${props.word}:${ctxHash((props.hebrewBefore ?? '') + '|' + (props.hebrewAfter ?? ''))}`;

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
    if (popupRef && !popupRef.contains(e.target as Node)) props.onClose();
  };
  window.addEventListener('keydown', onKey);
  // Use capture so we beat the viewer's own click handler on `.daf-word`
  document.addEventListener('mousedown', onDocClick, true);
  onCleanup(() => {
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('mousedown', onDocClick, true);
  });

  // Position above the word if there's room, else below
  const popupStyle = (): JSX.CSSProperties => {
    const a = props.anchor;
    const popupHeight = 80;
    const above = a.top > popupHeight + 16;
    const top = above ? a.top - popupHeight - 8 : a.bottom + 8;
    const centerX = (a.left + a.right) / 2;
    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${centerX}px`,
      transform: 'translateX(-50%)',
      'z-index': '1000',
    };
  };

  return (
    <div
      ref={popupRef}
      class="translation-popup"
      style={{
        ...popupStyle(),
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
          <span style={{ color: '#888', 'font-style': 'italic' }}>Translating…</span>
        </Show>
        <Show when={error()}>
          <span style={{ color: '#c33' }}>{error()}</span>
        </Show>
        <Show when={!loading() && !error() && translation()}>
          {translation()}
        </Show>
      </div>
    </div>
  );
}
