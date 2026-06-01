/**
 * RecipePanel — dev-shelf view of the OPEN sidebar card's recipe (its
 * declaration), so dev mode makes clear "what we are defining": the header
 * fields, the ordered sections, each section's type, and what each one pulls
 * from. `special` sections are flagged as custom — the one place genuinely
 * bespoke code lives.
 *
 * Reads the `activeRecipe` signal that ArgumentSidebar's dispatch publishes.
 * When that's null the open card is still a bespoke (un-converted) *Body — the
 * panel says so, which turns it into a live scoreboard of the generic-sidebar
 * migration: a card appears here the moment it becomes recipe-driven.
 *
 * Pairs with the existing inspect drawer: this answers "what is this card",
 * the "i" dots + drawer answer "how was each section made". A section's
 * `target` (for explainers) is the same leaf id you open in that drawer.
 */

import { For, Show, type JSX } from 'solid-js';
import { activeRecipe, describeRecipe, type RecipeSectionInfo } from './sidebar/primitives';

/** Monospace tag for a section's type — special is highlighted (it's the custom one). */
function TypeTag(props: { info: RecipeSectionInfo }): JSX.Element {
  const custom = () => props.info.custom;
  return (
    <span style={{
      'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-size': '0.62rem',
      'flex-shrink': 0,
      color: custom() ? '#9a3412' : '#475569',
      background: custom() ? '#ffedd5' : '#f1f5f9',
      border: `1px solid ${custom() ? '#fdba74' : '#e2e8f0'}`,
      padding: '0 0.3rem',
      'border-radius': '3px',
    }}>{props.info.type}</span>
  );
}

export default function RecipePanel(): JSX.Element {
  const info = () => {
    const r = activeRecipe();
    return r ? describeRecipe(r) : null;
  };
  return (
    <div style={{
      border: '1px solid #eee',
      'border-radius': '4px',
      background: '#fff',
      padding: '0.4rem 0.55rem',
      'font-size': '0.78rem',
      'line-height': 1.45,
    }}>
      <div style={{
        'font-size': '0.65rem',
        'text-transform': 'uppercase',
        'letter-spacing': '0.06em',
        color: '#888',
        'margin-bottom': '0.3rem',
        display: 'flex',
        'align-items': 'baseline',
        gap: '0.4rem',
      }}>
        <span>Recipe</span>
        <Show when={info()}>
          {(i) => (
            <span style={{
              'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
              'font-size': '0.66rem',
              color: '#7c3aed',
              'text-transform': 'none',
              'letter-spacing': 0,
            }}>{i().kind}</span>
          )}
        </Show>
      </div>

      <Show
        when={info()}
        fallback={
          <div style={{ color: '#aaa', 'font-size': '0.72rem', 'font-style': 'italic' }}>
            no recipe-driven card open — bespoke cards aren't declared yet
          </div>
        }
      >
        {(i) => (
          <>
            {/* Header — which fields make the card title */}
            <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem', padding: '0.1rem 0', color: '#555' }}>
              <span style={{ color: '#aaa', 'font-size': '0.66rem', 'flex-shrink': 0, width: '1.1rem' }}>·</span>
              <span style={{ 'font-size': '0.66rem', color: '#888', 'flex-shrink': 0 }}>header</span>
              <span style={{
                'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
                'font-size': '0.7rem', color: '#444', flex: 1, 'min-width': 0,
                'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis',
              }}>{i().header}</span>
            </div>

            {/* Sections, in render order */}
            <For each={i().sections}>{(s) => (
              <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.4rem', padding: '0.15rem 0', color: '#444' }}>
                <span style={{
                  color: '#bbb', 'font-variant-numeric': 'tabular-nums',
                  'flex-shrink': 0, width: '1.1rem', 'text-align': 'right',
                  'font-size': '0.7rem',
                }}>{s.n}</span>
                <TypeTag info={s} />
                <Show when={s.target}>
                  <span style={{ color: '#bbb', 'flex-shrink': 0 }}>→</span>
                  <span style={{
                    'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    'font-size': '0.7rem', color: '#666', flex: 1, 'min-width': 0,
                    'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis',
                  }}>{s.target}</span>
                </Show>
              </div>
            )}</For>

            <Show when={i().sections.some((s) => s.custom)}>
              <div style={{ color: '#9a3412', 'font-size': '0.66rem', 'margin-top': '0.3rem' }}>
                special = custom block (registered, not freeform)
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
