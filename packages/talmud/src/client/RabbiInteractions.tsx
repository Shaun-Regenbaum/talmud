/**
 * "Interactions" — who this sage is linked to in the text, and how. One row per partner, most linked first, with a
 * thin bar for the mix of what the text says between them; tap a row for the specifics and example passages.
 *
 * Replaces the lineage tree for sages the study is sure about (see sageInteractions.ts). Nothing here is model
 * output: every count is a passage where the two names stand together.
 */

import { createSignal, For, type JSX, Show } from 'solid-js';
import { lang, t } from './i18n';
import { useRabbiLinks } from './rabbiLinks';
import {
  barSegments,
  kindLines,
  onThisPage,
  type Partner,
  partnerLabel,
  type SageInteractions,
  sefariaUrl,
} from './sageInteractions';

const COLLAPSED = 8;

export default function RabbiInteractions(props: {
  data: SageInteractions;
  subjectName: string;
}): JSX.Element {
  const links = useRabbiLinks();
  const [expanded, setExpanded] = createSignal(false);
  const [open, setOpen] = createSignal<string | null>(null);
  const L = (): 'en' | 'he' => (lang() === 'he' ? 'he' : 'en');
  const subject = (): string =>
    L() === 'he' ? props.data.nameHe : props.subjectName || props.data.name;
  const shown = (): Partner[] => props.data.partners.slice(0, expanded() ? undefined : COLLAPSED);
  const pageRabbis = () => links?.rabbis() ?? [];

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        'border-radius': '6px',
        background: 'var(--bg)',
        padding: '0.7rem 0.85rem',
        'margin-top': '0.9rem',
      }}
    >
      <div
        style={{
          'font-size': '0.7rem',
          'text-transform': 'uppercase',
          'letter-spacing': '0.08em',
          color: 'var(--muted)',
          'margin-bottom': '0.35rem',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
        }}
      >
        <span>{t('rabbi.interactions.title')}</span>
        <Show when={props.data.partners.length > COLLAPSED}>
          <button
            type="button"
            onClick={() => setExpanded(!expanded())}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--muted)',
              cursor: 'pointer',
              'font-size': '0.65rem',
              'font-family': 'inherit',
              'text-transform': 'uppercase',
              'letter-spacing': '0.06em',
            }}
          >
            {expanded() ? t('common.collapse') : t('common.showAll')}
          </button>
        </Show>
      </div>

      <For each={shown()}>
        {(p) => {
          const key = p.nameHe;
          const isOpen = () => open() === key;
          const here = () => onThisPage(p, pageRabbis());
          return (
            <div style={{ 'border-bottom': '1px solid var(--line)' }}>
              <button
                type="button"
                dir="rtl"
                lang="he"
                aria-expanded={isOpen()}
                onClick={() => setOpen(isOpen() ? null : key)}
                style={{
                  display: 'grid',
                  'grid-template-columns': '1fr 72px 2.2rem',
                  gap: '0.5rem',
                  'align-items': 'center',
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  padding: '0.42rem 0',
                  cursor: 'pointer',
                  'font-size': '0.95rem',
                  color: 'var(--fg)',
                  'text-align': 'start',
                  'font-family': 'var(--font-hebrew), serif',
                }}
              >
                <span style={{ 'font-weight': isOpen() || here() ? 600 : 400 }}>
                  {partnerLabel(p)}
                  <Show when={here()}>
                    <span
                      title={t('rabbi.interactions.onThisPage')}
                      style={{ color: 'var(--accent)' }}
                    >
                      {' '}
                      •
                    </span>
                  </Show>
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'flex',
                    height: '6px',
                    'border-radius': '3px',
                    overflow: 'hidden',
                    background: 'var(--surface-sunk)',
                  }}
                >
                  <For each={barSegments(p)}>
                    {(s) => (
                      <i
                        style={{
                          display: 'block',
                          width: `${s.share * 100}%`,
                          background: s.color,
                        }}
                      />
                    )}
                  </For>
                </span>
                <span
                  style={{
                    color: 'var(--muted)',
                    'font-size': '0.78rem',
                    'text-align': 'end',
                    'font-family': 'var(--font-ui)',
                    'font-variant-numeric': 'tabular-nums',
                  }}
                >
                  {p.total}
                </span>
              </button>
              <Show when={isOpen()}>
                <div style={{ padding: '0 0 0.55rem', 'font-size': '0.8rem' }}>
                  <For each={kindLines(p, subject(), L())}>
                    {(k) => (
                      <div style={{ padding: '0.12rem 0' }}>
                        <i
                          style={{
                            display: 'inline-block',
                            width: '9px',
                            height: '9px',
                            'border-radius': '2px',
                            background: k.color,
                            'margin-inline-end': '0.4rem',
                          }}
                        />
                        {k.label} <strong>{k.n}</strong>
                        <Show when={k.directions}>
                          <span style={{ color: 'var(--muted)', 'font-size': '0.74rem' }}>
                            {' '}
                            ({k.directions})
                          </span>
                        </Show>
                        <Show when={k.refs.length > 0}>
                          <span style={{ color: 'var(--muted)', 'font-size': '0.74rem' }}>
                            {' · '}
                            <For each={k.refs}>
                              {(ref, i) => (
                                <>
                                  <Show when={i() > 0}>{', '}</Show>
                                  <Show when={sefariaUrl(ref)} fallback={<span>{ref}</span>}>
                                    {(url) => (
                                      <a
                                        href={url()}
                                        target="_blank"
                                        rel="noopener"
                                        style={{ color: 'var(--ink-link)' }}
                                      >
                                        {ref}
                                      </a>
                                    )}
                                  </Show>
                                </>
                              )}
                            </For>
                          </span>
                        </Show>
                      </div>
                    )}
                  </For>
                  <Show when={links && (p.name || p.nameHe)}>
                    <button
                      type="button"
                      onClick={() => links?.onPushRabbi(p.name ?? p.nameHe)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '0.25rem 0 0',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        'font-family': 'inherit',
                        'font-size': '0.78rem',
                      }}
                    >
                      {t('rabbi.interactions.openCard')}
                    </button>
                  </Show>
                </div>
              </Show>
            </div>
          );
        }}
      </For>

      <p style={{ margin: '0.5rem 0 0', color: 'var(--muted)', 'font-size': '0.72rem' }}>
        {t('rabbi.interactions.about', { n: String(props.data.partnersInAll) })}
      </p>
    </div>
  );
}
