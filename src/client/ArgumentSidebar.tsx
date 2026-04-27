import { For, Show, createResource, createSignal, onCleanup, type JSX } from 'solid-js';
import type { Section, Rabbi } from './AnalysisPanel';
import type { HalachaTopic } from './HalachaPanel';
import type { AggadataStory } from './AggadataDetector';
import { GENERATION_BY_ID, type GenerationId } from './generations';
import type { IdentifiedRabbi } from './dafContext';
import type { Pasuk } from './DafViewer';
import { Hebraized } from './Hebraized';

export type SidebarContent =
  | { kind: 'argument'; section: Section; index: number }
  | { kind: 'halacha'; topic: HalachaTopic; index: number }
  | { kind: 'aggadata'; story: AggadataStory; index: number }
  | { kind: 'pesuk'; pasuk: Pasuk; index: number }
  | { kind: 'rabbi'; rabbi: IdentifiedRabbi };

export interface ArgumentSidebarProps {
  content: SidebarContent | null;
  tractate: string;
  page: string;
  activeRabbi: string | null;
  onClose: () => void;
  onHighlightRabbi: (name: string | null) => void;
  onOpenRabbiSlug?: (slug: string) => void;
  generationByName: Map<string, GenerationId>;
}

// Parse markdown-style links out of a bio string. Sefaria `/topics/<slug>`
// links become internal buttons that swap the sidebar to that rabbi's bio
// (via `onOpenSlug`); every other link stays as an external anchor. Links
// whose URL doesn't parse fall back to the raw bracketed text.
const BIO_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const SEFARIA_TOPIC_RE = /^https?:\/\/(?:www\.)?sefaria\.org\/topics\/([^/?#]+)/i;

function renderBioWithLinks(
  bio: string,
  onOpenSlug?: (slug: string) => void,
): JSX.Element[] {
  const out: JSX.Element[] = [];
  let last = 0;
  BIO_LINK_RE.lastIndex = 0;
  for (let m = BIO_LINK_RE.exec(bio); m !== null; m = BIO_LINK_RE.exec(bio)) {
    if (m.index > last) out.push(bio.slice(last, m.index));
    const [, text, rawUrl] = m;
    const url = rawUrl.replace(/&amp;/g, '&');
    const topic = url.match(SEFARIA_TOPIC_RE);
    if (topic && onOpenSlug) {
      const slug = topic[1];
      out.push(
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onOpenSlug(slug); }}
          style={{
            background: 'none', border: 'none', padding: 0, margin: 0,
            color: '#1e40af', cursor: 'pointer', 'text-decoration': 'underline',
            font: 'inherit',
          }}
        >{text}</button>
      );
    } else {
      out.push(
        <a href={url} target="_blank" rel="noopener noreferrer"
           style={{ color: '#1e40af' }}>{text}</a>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < bio.length) out.push(bio.slice(last));
  return out;
}

function RabbiRow(props: {
  rabbi: Rabbi;
  active: boolean;
  generationId?: GenerationId;
  onToggle: () => void;
}): JSX.Element {
  const genInfo = () => (props.generationId ? GENERATION_BY_ID[props.generationId] : null);
  return (
    <button
      onClick={props.onToggle}
      style={{
        width: '100%',
        'text-align': 'left',
        display: 'block',
        padding: '0.55rem 0.7rem',
        margin: '0 0 0.4rem',
        background: props.active ? '#fef3c7' : '#fafaf7',
        border: '1px solid ' + (props.active ? '#eab308' : '#eae8e0'),
        'border-radius': '4px',
        cursor: 'pointer',
        'font-family': 'inherit',
        'font-size': '0.85rem',
      }}
      title={props.active ? 'Click to un-highlight' : 'Click to highlight in daf'}
    >
      <div style={{ 'font-weight': 600, color: '#333' }}>
        {props.rabbi.name}{' '}
        <span dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif', color: '#888', 'font-weight': 'normal' }}>
          {props.rabbi.nameHe}
        </span>
      </div>
      <Show when={genInfo()}>
        {(g) => (
          <div style={{ 'margin-top': '0.25rem', display: 'flex', 'align-items': 'center', gap: '0.4rem', 'font-size': '0.72rem', color: '#666' }}>
            <span style={{
              display: 'inline-block',
              width: '1.4rem',
              height: '0.35rem',
              'background-color': g().color,
              'border-radius': '2px',
            }} />
            <span>{g().label} · {g().era}</span>
          </div>
        )}
      </Show>
      <div style={{ color: '#666', 'margin-top': '0.2rem', 'font-size': '0.78rem' }}>
        {props.rabbi.period} · {props.rabbi.location}
      </div>
      <div style={{ color: '#444', 'margin-top': '0.35rem', 'line-height': 1.45 }}>
        <Hebraized text={props.rabbi.role} />
      </div>
    </button>
  );
}

function sefariaUrl(source: 'mishnehTorah' | 'shulchanAruch' | 'rema', ref: string): string | null {
  const trimmed = ref.trim();
  if (source === 'mishnehTorah') {
    return `https://www.sefaria.org/search?q=${encodeURIComponent('Mishneh Torah ' + trimmed)}`;
  }
  const match = trimmed.match(/^(Orach(?:\s+)?(?:Ch|H)(?:aim|ayyim)?|Yoreh\s+De'?ah|Even\s+Ha'?Ezer|Choshen\s+Mishpat)\s+(\d+):(\d+)/i);
  if (match) {
    const sectionMap: Record<string, string> = {
      orachchaim: 'Orach_Chayyim', orachchayyim: 'Orach_Chayyim', orachhaim: 'Orach_Chayyim',
      yorehdeah: 'Yoreh_De%27ah', evenhaezer: 'Even_HaEzer', choshenmishpat: 'Choshen_Mishpat',
    };
    const normalized = match[1].toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
    const section = sectionMap[normalized];
    if (section) {
      const prefix = source === 'rema' ? 'Mappah' : 'Shulchan_Arukh';
      return `https://www.sefaria.org/${prefix}%2C_${section}.${match[2]}.${match[3]}`;
    }
  }
  return `https://www.sefaria.org/search?q=${encodeURIComponent(trimmed)}`;
}

function RulingRow(props: {
  source: 'mishnehTorah' | 'shulchanAruch' | 'rema';
  label: string;
  color: string;
  ruling?: { ref: string; summary: string };
}): JSX.Element {
  return (
    <Show when={props.ruling}>
      {(r) => {
        const url = sefariaUrl(props.source, r().ref);
        return (
          <div style={{
            padding: '0.55rem 0.7rem',
            background: '#fafaf7',
            border: '1px solid #eae8e0',
            'border-radius': '4px',
            'margin-bottom': '0.45rem',
          }}>
            <div style={{
              'font-size': '0.68rem',
              'text-transform': 'uppercase',
              'letter-spacing': '0.06em',
              'font-weight': 600,
              color: props.color,
              'margin-bottom': '0.25rem',
            }}>
              {props.label}
            </div>
            <div style={{ 'font-weight': 500, color: '#333', 'margin-bottom': '0.2rem', 'font-size': '0.85rem' }}>
              <a href={url ?? '#'} target="_blank" rel="noopener noreferrer"
                 style={{ color: props.color, 'text-decoration': 'none' }}>
                {r().ref} ↗
              </a>
            </div>
            <div style={{ color: '#555', 'line-height': 1.45, 'font-size': '0.85rem' }}>
              <Hebraized text={r().summary} />
            </div>
          </div>
        );
      }}
    </Show>
  );
}

interface PasukDetail {
  ref: string;
  heRef: string | null;
  he: string;
  en: string;
  prevRef: string | null;
  nextRef: string | null;
  error?: string;
}

async function fetchPasuk(ref: string): Promise<PasukDetail> {
  const res = await fetch(`/api/pasuk?ref=${encodeURIComponent(ref)}`);
  return res.json() as Promise<PasukDetail>;
}

/** Sidebar panel for a cited pasuk: shows the full Hebrew Tanakh verse and,
 *  on expand, the surrounding verses inlined as one continuous Hebrew block
 *  (prev + cited + next) with the cited verse rendered dark and the others
 *  dimmed so the citation still stands out. */
function PasukPanel(props: { pasuk: Pasuk }): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);
  const [detail] = createResource(() => props.pasuk.verseRef, fetchPasuk);
  const [prev] = createResource(
    () => (expanded() ? detail()?.prevRef ?? null : null),
    (r) => fetchPasuk(r),
  );
  const [next] = createResource(
    () => (expanded() ? detail()?.nextRef ?? null : null),
    (r) => fetchPasuk(r),
  );
  const synth = () => props.pasuk.synthesize?.explanation;

  return (
    <div>
      <h3 dir="rtl" lang="he" style={{
        margin: '0 0 0.5rem', 'font-family': '"Mekorot Vilna", serif',
        'font-size': '1.05rem', color: '#9a3412',
      }}>
        {detail()?.heRef ?? props.pasuk.verseRef}
      </h3>
      <Show when={detail.loading && !detail()}>
        <p style={{ color: '#999', 'font-style': 'italic', margin: '0 0 0.5rem' }}>Loading verse…</p>
      </Show>
      <p dir="rtl" lang="he" style={{
        margin: '0 0 0.4rem', 'font-family': '"Mekorot Vilna", serif',
        'font-size': '1.05rem', 'line-height': 1.6,
      }}>
        <Show when={expanded() && prev()?.he}>
          <span style={{ color: '#a8a29e' }}>{prev()!.he} </span>
        </Show>
        <Show when={detail()?.he}>
          <span style={{ color: '#451a03' }}>{detail()!.he}</span>
        </Show>
        <Show when={expanded() && next()?.he}>
          <span style={{ color: '#a8a29e' }}> {next()!.he}</span>
        </Show>
      </p>
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        style={{
          background: 'none', border: 'none', padding: '0.15rem 0',
          margin: '0.1rem 0 0.7rem', color: '#a8a29e', cursor: 'pointer',
          font: 'inherit', 'font-size': '0.62rem',
          'letter-spacing': '0.06em', 'text-transform': 'uppercase',
        }}
        title={expanded() ? 'Hide surrounding verses' : 'Show verse before + after'}
      >{expanded() ? '› collapse ‹' : '‹ expand ›'}</button>
      <Show when={synth()} fallback={
        <p style={{
          margin: 0, color: '#57534e', 'line-height': 1.55,
          'font-style': props.pasuk.summary ? 'normal' : 'italic',
        }}>
          <Show when={props.pasuk.summary} fallback={'Loading explanation…'}>
            <Hebraized text={props.pasuk.summary} />
          </Show>
        </p>
      }>
        <p style={{ margin: 0, color: '#1c1917', 'line-height': 1.55 }}>
          <Hebraized text={synth()!} />
        </p>
      </Show>
    </div>
  );
}

export function ArgumentSidebar(props: ArgumentSidebarProps): JSX.Element {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
  };
  window.addEventListener('keydown', onKey);
  onCleanup(() => window.removeEventListener('keydown', onKey));

  return (
    <Show when={props.content}>
      {(c) => (
        <aside
          style={{
            background: '#fff',
            border: '1px solid #e5e3dc',
            'border-radius': '6px',
            'box-shadow': '0 2px 8px rgba(0,0,0,0.06)',
            padding: '1rem 1.1rem 1.5rem',
            'font-family': 'system-ui, -apple-system, sans-serif',
            'font-size': '0.9rem',
            color: '#222',
          }}
        >
            <header style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
              'padding-bottom': '0.6rem',
              'border-bottom': '1px solid #eee',
              'margin-bottom': '0.75rem',
            }}>
              <span style={{ 'font-size': '0.7rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.08em' }}>
                {c().kind === 'argument' ? 'Argument'
                  : c().kind === 'halacha' ? 'Practical Halacha'
                  : c().kind === 'aggadata' ? 'Aggada'
                  : c().kind === 'pesuk' ? 'Pasuk'
                  : 'Rabbi'}
                {' · '}
                {props.tractate} {props.page}
              </span>
              <button
                onClick={props.onClose}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  'font-size': '1.2rem', color: '#888', padding: '0.1rem 0.3rem',
                }}
                aria-label="Close"
              >×</button>
            </header>

            <Show when={c().kind === 'argument'}>
              {(() => {
                const section = (c() as Extract<SidebarContent, { kind: 'argument' }>).section;
                return (
                  <div>
                    <h3 style={{ margin: '0 0 0.3rem', 'font-size': '1.05rem', color: '#8a2a2b' }}>
                      {section.title}
                    </h3>
                    <Show when={section.excerpt}>
                      <p dir="rtl" lang="he" style={{
                        margin: '0 0 0.5rem', 'font-family': '"Mekorot Vilna", serif',
                        'font-size': '0.95rem', color: '#555',
                      }}>
                        {section.excerpt}…
                      </p>
                    </Show>
                    <p style={{ margin: '0 0 0.9rem', color: '#333', 'line-height': 1.55 }}>
                      <Hebraized text={section.summary} />
                    </p>
                    <Show when={section.rabbis.length > 0}>
                      <div style={{
                        'font-size': '0.7rem',
                        'text-transform': 'uppercase',
                        'letter-spacing': '0.08em',
                        color: '#999',
                        'margin-bottom': '0.4rem',
                      }}>
                        Rabbis — click to highlight in daf
                      </div>
                      <For each={section.rabbis}>
                        {(r) => {
                          const gen = props.generationByName.get(r.name);
                          const active = props.activeRabbi === r.name;
                          return (
                            <RabbiRow
                              rabbi={r}
                              active={active}
                              generationId={gen}
                              onToggle={() => props.onHighlightRabbi(active ? null : r.name)}
                            />
                          );
                        }}
                      </For>
                    </Show>
                  </div>
                );
              })()}
            </Show>

            <Show when={c().kind === 'rabbi'}>
              {(() => {
                const r = (c() as Extract<SidebarContent, { kind: 'rabbi' }>).rabbi;
                const gen = GENERATION_BY_ID[r.generation];
                return (
                  <div>
                    <h3 style={{ margin: '0 0 0.2rem', 'font-size': '1.05rem', color: '#333' }}>
                      {r.name}
                    </h3>
                    <Show when={r.nameHe}>
                      <p dir="rtl" lang="he" style={{
                        margin: '0 0 0.5rem', 'font-family': '"Mekorot Vilna", serif',
                        'font-size': '1rem', color: '#666',
                      }}>{r.nameHe}</p>
                    </Show>
                    <Show when={gen}>
                      <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', 'font-size': '0.75rem', color: '#666', 'margin-bottom': '0.6rem' }}>
                        <span style={{
                          display: 'inline-block', width: '1.4rem', height: '0.4rem',
                          'background-color': gen.color, 'border-radius': '2px',
                        }} />
                        <span>{gen.label} · {gen.era}</span>
                        <Show when={r.region}>
                          <span style={{ color: '#999' }}>·</span>
                          <span style={{ 'text-transform': 'capitalize' }}>{r.region === 'israel' ? 'Eretz Yisrael' : r.region}</span>
                        </Show>
                      </div>
                    </Show>
                    <Show when={r.places.length > 0}>
                      <div style={{ 'font-size': '0.78rem', color: '#666', 'margin-bottom': '0.7rem' }}>
                        <span style={{ color: '#999', 'margin-right': '0.3rem' }}>Places:</span>
                        {r.places.join(' · ')}
                      </div>
                    </Show>
                    <Show when={r.bio}>
                      <p style={{ margin: '0 0 0.8rem', color: '#333', 'line-height': 1.55, 'font-size': '0.88rem' }}>
                        {renderBioWithLinks(r.bio!, props.onOpenRabbiSlug)}
                      </p>
                    </Show>
                    <Show when={r.wiki}>
                      <a href={r.wiki!} target="_blank" rel="noopener noreferrer"
                         style={{ 'font-size': '0.78rem', color: '#1e40af' }}>
                        Wikipedia →
                      </a>
                    </Show>
                    <Show when={!r.bio && !r.places.length}>
                      <p style={{ color: '#999', 'font-style': 'italic', 'font-size': '0.85rem' }}>
                        No bio data in the local Sefaria-derived dataset for this rabbi.
                      </p>
                    </Show>
                  </div>
                );
              })()}
            </Show>

            <Show when={c().kind === 'halacha'}>
              {(() => {
                const topic = (c() as Extract<SidebarContent, { kind: 'halacha' }>).topic;
                return (
                  <div>
                    <h3 style={{ margin: '0 0 0.3rem', 'font-size': '1.05rem', color: '#1e40af' }}>
                      {topic.topic}
                    </h3>
                    <Show when={topic.topicHe}>
                      <p dir="rtl" lang="he" style={{
                        margin: '0 0 0.3rem', 'font-family': '"Mekorot Vilna", serif',
                        'font-size': '0.95rem', color: '#666',
                      }}>
                        {topic.topicHe}
                      </p>
                    </Show>
                    <Show when={topic.excerpt}>
                      <p dir="rtl" lang="he" style={{
                        margin: '0 0 0.9rem', 'font-family': '"Mekorot Vilna", serif',
                        'font-size': '0.9rem', color: '#888',
                      }}>
                        anchor: {topic.excerpt}
                      </p>
                    </Show>
                    <RulingRow source="mishnehTorah" label="Mishneh Torah" color="#8a2a2b" ruling={topic.rulings.mishnehTorah} />
                    <RulingRow source="shulchanAruch" label="Shulchan Aruch" color="#1e40af" ruling={topic.rulings.shulchanAruch} />
                    <RulingRow source="rema" label="Rema" color="#7c3aed" ruling={topic.rulings.rema} />
                  </div>
                );
              })()}
            </Show>

            <Show when={c().kind === 'pesuk'}>
              <PasukPanel pasuk={(c() as Extract<SidebarContent, { kind: 'pesuk' }>).pasuk} />
            </Show>

            <Show when={c().kind === 'aggadata'}>
              {(() => {
                const story = (c() as Extract<SidebarContent, { kind: 'aggadata' }>).story;
                return (
                  <div>
                    <h3 style={{ margin: '0 0 0.3rem', 'font-size': '1.05rem', color: '#7c3aed' }}>
                      {story.title}
                    </h3>
                    <Show when={story.titleHe}>
                      <p dir="rtl" lang="he" style={{
                        margin: '0 0 0.5rem', 'font-family': '"Mekorot Vilna", serif',
                        'font-size': '1rem', color: '#666',
                      }}>
                        {story.titleHe}
                      </p>
                    </Show>
                    <Show when={story.theme}>
                      <div style={{ 'margin-bottom': '0.7rem' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.1rem 0.5rem',
                          'font-size': '0.7rem',
                          'text-transform': 'uppercase',
                          'letter-spacing': '0.06em',
                          color: '#7c3aed',
                          background: '#faf5ff',
                          border: '1px solid #d8b4fe',
                          'border-radius': '3px',
                        }}>
                          {story.theme}
                        </span>
                      </div>
                    </Show>
                    <p style={{ margin: '0 0 0.8rem', color: '#333', 'line-height': 1.55 }}>
                      <Hebraized text={story.summary} />
                    </p>
                  </div>
                );
              })()}
            </Show>

        </aside>
      )}
    </Show>
  );
}
