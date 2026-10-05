/**
 * "Who he appears with": the people named near this sage in the text, ranked by
 * how many passages they share, each with a bar that shows what those passages
 * do (argue, speak to each other, pass on a teaching...). Open a row to see the
 * counts by kind, who acts on whom, and links into the pages.
 *
 * Data: static/sage-interactions/<slug>.json (the study's passage-by-passage
 * record). It exists only for sages the study is sure are one man behind one
 * name; everyone else gets an honest "still being worked out" note, never a
 * guessed list.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import { TRACTATE_OPTIONS } from '../lib/sefref/tractates';
import { lang, t } from './i18n';
import {
  barSegments,
  fetchSageInteractions,
  KINDS,
  kindLines,
  type Partner,
  sefariaUrl,
} from './sageInteractions';

const SHOWN = 10;
const REFS_SHOWN = 4;
const BAVLI = new Set(TRACTATE_OPTIONS.map((o) => o.value));

/** "Arakhin 20a:27" -> the reader's page; anything outside the Bavli stays a Sefaria link. */
function refLink(ref: string): { href: string; label: string; external: boolean } {
  const m = ref.match(/^(.*?)\s+(\d+[ab])(?::\d+)*$/);
  if (m && BAVLI.has(m[1])) {
    return {
      href: `?tractate=${encodeURIComponent(m[1])}&page=${encodeURIComponent(m[2])}#daf`,
      label: `${m[1]} ${m[2]}`,
      external: false,
    };
  }
  const url = sefariaUrl(ref);
  return { href: url ?? '', label: ref, external: true };
}

function topKind(p: Partner): string {
  const best = KINDS.map((k) => ({ k, n: p.kinds[k.kind] ?? 0 })).sort((a, b) => b.n - a.n)[0];
  if (!best || best.n === 0) return '';
  return t('sages.partners.mostly', {
    kind: lang() === 'he' ? best.k.he : best.k.en,
    share: String(Math.round((best.n / Math.max(1, p.total)) * 100)),
  });
}

export function SagePartners(props: {
  slug: string;
  nameFor: (slug: string) => string;
  onSelect: (slug: string) => void;
}) {
  const [data] = createResource(
    () => props.slug,
    (slug) => fetchSageInteractions(slug),
  );
  const [all, setAll] = createSignal(false);
  const partners = () => data()?.partners ?? [];
  const shown = () => (all() ? partners() : partners().slice(0, SHOWN));
  const subject = () => props.nameFor(props.slug);
  const display = (p: Partner) =>
    lang() === 'he' ? p.nameHe : p.name && p.name !== p.nameHe ? p.name : p.nameHe;
  return (
    <section class="sage-partners" aria-label={t('sages.partners.title')}>
      <h3>{t('sages.partners.title')}</h3>
      <Show when={!data.loading} fallback={<p class="sages-note">{t('sages.list.loading')}</p>}>
        <Show when={data()} fallback={<p class="sages-note">{t('sages.partners.inProgress')}</p>}>
          <p class="sages-note">
            {t('sages.partners.note', {
              shown: String(Math.min(partners().length, all() ? partners().length : SHOWN)),
              all: String(data()!.partnersInAll),
            })}
          </p>
          <ul class="sage-partner-list">
            <For each={shown()}>
              {(p) => (
                <li>
                  <details class="sage-partner">
                    <summary>
                      <span class="sage-partner-name">
                        <Show when={p.slug} fallback={display(p)}>
                          <a
                            href={`#sages/${encodeURIComponent(p.slug!)}`}
                            class="sages-person-link"
                            onClick={(event) => {
                              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                                return;
                              event.preventDefault();
                              event.stopPropagation();
                              props.onSelect(p.slug!);
                            }}
                          >
                            {display(p)}
                          </a>
                        </Show>
                        <Show when={lang() !== 'he' && display(p) !== p.nameHe}>
                          <span class="sage-partner-he" dir="rtl" lang="he">
                            {p.nameHe}
                          </span>
                        </Show>
                      </span>
                      <span class="sage-partner-bar" aria-hidden="true">
                        <For each={barSegments(p)}>
                          {(s) => (
                            <span style={{ width: `${s.share * 100}%`, background: s.color }} />
                          )}
                        </For>
                      </span>
                      <span class="sage-partner-total">
                        {t('sages.partners.passages', { count: String(p.total) })}
                      </span>
                      <span class="sage-partner-gist">{topKind(p)}</span>
                    </summary>
                    <div class="sage-partner-body">
                      <a
                        class="sages-person-link"
                        href={`#sages/${encodeURIComponent(props.slug)}/with/${encodeURIComponent(p.slug ?? p.nameHe)}`}
                      >
                        {t('sages.pair.open')}
                      </a>
                      <For each={kindLines(p, subject(), lang())}>
                        {(line) => (
                          <div class="sage-kind-line">
                            <div class="sage-kind-head">
                              <i style={{ background: line.color }} />
                              <strong>{line.n}</strong> {line.label}
                            </div>
                            <Show when={line.directions}>
                              <div class="sage-kind-dir">{line.directions}</div>
                            </Show>
                            <Show when={line.refs.length}>
                              <div class="sages-reference-links">
                                <For each={line.refs.slice(0, REFS_SHOWN)}>
                                  {(ref) => {
                                    const l = refLink(ref);
                                    return (
                                      <Show when={l.href} fallback={<span>{l.label}</span>}>
                                        <a
                                          href={l.href}
                                          target={l.external ? '_blank' : undefined}
                                          rel={l.external ? 'noopener noreferrer' : undefined}
                                        >
                                          {l.label}
                                        </a>
                                      </Show>
                                    );
                                  }}
                                </For>
                              </div>
                            </Show>
                          </div>
                        )}
                      </For>
                      <Show when={p.slug}>
                        <button
                          type="button"
                          class="sages-person-link"
                          onClick={() => props.onSelect(p.slug!)}
                        >
                          {t('sages.partners.open', { name: display(p) })} →
                        </button>
                      </Show>
                    </div>
                  </details>
                </li>
              )}
            </For>
          </ul>
          <Show when={partners().length > SHOWN}>
            <button type="button" class="sages-person-link" onClick={() => setAll(!all())}>
              {all()
                ? t('sages.partners.fewer')
                : t('sages.partners.more', { count: String(partners().length - SHOWN) })}
            </button>
          </Show>
        </Show>
      </Show>
    </section>
  );
}
