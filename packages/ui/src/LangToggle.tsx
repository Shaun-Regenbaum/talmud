/**
 * @corpus/ui — LangToggle.
 *
 * The EN / עב segmented switch in app chrome. Chrome (--font-ui). Styling:
 * `.ui-lang-toggle` in components.css.
 */

import type { JSX } from 'solid-js';

export interface LangToggleProps {
  lang: 'en' | 'he';
  onChange: (lang: 'en' | 'he') => void;
}

export function LangToggle(props: LangToggleProps): JSX.Element {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset brings UA margin/min-inline-size that changes the segmented layout; div+role="group" carries the same semantics
    <div class="ui-lang-toggle" role="group" aria-label="Language">
      <button
        type="button"
        classList={{ active: props.lang === 'en' }}
        onClick={() => props.onChange('en')}
      >
        EN
      </button>
      <button
        type="button"
        classList={{ active: props.lang === 'he' }}
        onClick={() => props.onChange('he')}
      >
        עב
      </button>
    </div>
  );
}
