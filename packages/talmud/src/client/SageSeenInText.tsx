/** What the Talmud text says about this sage: who they ask, answer, teach and are linked to, with the words. */
import { createResource, For, type JSX, Show } from 'solid-js';
import type { SageLink } from '../lib/sage-graph/sage-links';
import { lang, t } from './i18n';
import { sefariaUrl } from './sageInteractions';

async function load(slug: string): Promise<SageLink[]> {
  try {
    const response = await fetch(`/api/sage-graph/sage-links/${encodeURIComponent(slug)}`);
    if (!response.ok) return [];
    return ((await response.json()) as { links?: SageLink[] }).links ?? [];
  } catch {
    return [];
  }
}

/** The sentence that starts a group, from this sage's side of the relation. */
function phrase(link: SageLink): string {
  const key = `sages.seen.${link.relation}.${link.role === 'object' ? 'object' : 'subject'}`;
  const text = t(key);
  return text === key ? link.relation.replace(/_/g, ' ') : text;
}

export function SageSeenInText(props: {
  slug: string;
  nameFor: (slug: string) => string;
  onSelect: (slug: string) => void;
}): JSX.Element {
  const [links] = createResource(() => props.slug, load);
  const number = (n: number) => n.toLocaleString(lang() === 'he' ? 'he-IL' : 'en-US');
  return (
    <Show when={(links()?.length ?? 0) > 0}>
      <section class="sage-seen" aria-labelledby="sage-seen-title">
        <h3 id="sage-seen-title">{t('sages.seen.title')}</h3>
        <p class="sage-seen-note">{t('sages.seen.note')}</p>
        <ul class="sage-seen-list">
          <For each={links()}>
            {(link) => (
              <li>
                <details>
                  <summary>
                    <span class="sage-seen-what">{phrase(link)}</span>{' '}
                    <button
                      type="button"
                      class="sages-person-link"
                      onClick={(event) => {
                        event.preventDefault();
                        props.onSelect(link.partner);
                      }}
                    >
                      {props.nameFor(link.partner)}
                    </button>
                    <span class="sage-seen-count">
                      {t('sages.seen.passages', { count: number(link.passages) })}
                    </span>
                  </summary>
                  <ul class="sage-seen-quotes">
                    <For each={link.examples}>
                      {(example) => (
                        <li>
                          <q dir="rtl" lang="he">
                            {example.quote}
                          </q>{' '}
                          <Show
                            when={sefariaUrl(example.ref)}
                            fallback={<span class="sage-seen-ref">{example.ref}</span>}
                          >
                            {(url) => (
                              <a
                                class="sage-seen-ref"
                                href={url()}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {example.ref}
                              </a>
                            )}
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </details>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}
