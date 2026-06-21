/**
 * @corpus/ui — Prose.
 *
 * A bilingual reading-prose block: given English + Hebrew text and the reader's
 * language, it shows the preferred one (falling back to the other when the
 * preferred is empty) with the correct direction and reading font — English in
 * --font-serif, Hebrew in --font-hebrew. This is the SHARED English-reading
 * treatment both apps use, so a note reads the same in tanach and talmud.
 * Styling: `.ui-prose` in components.css.
 */

import type { JSX } from 'solid-js';

export interface ProseProps {
  en?: string;
  he?: string;
  /** Preferred language; falls back to the other when the preferred is empty. */
  lang: 'en' | 'he';
  /** Extra class(es) for spacing/size tweaks at the call site. */
  class?: string;
}

export function Prose(props: ProseProps): JSX.Element {
  // Decide which language is actually shown (honour the preference, fall back),
  // then direction + font follow the shown text — not the preference.
  const shown = (): 'en' | 'he' => {
    if (props.lang === 'he') return props.he ? 'he' : 'en';
    return props.en ? 'en' : 'he';
  };
  const text = (): string => (shown() === 'he' ? props.he : props.en) ?? '';
  return (
    <p
      class="ui-prose"
      classList={props.class ? { [props.class]: true } : undefined}
      dir={shown() === 'he' ? 'rtl' : 'ltr'}
    >
      {text()}
    </p>
  );
}
