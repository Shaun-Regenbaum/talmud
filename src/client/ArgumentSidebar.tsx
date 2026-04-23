import { For, Show, onCleanup, type JSX } from 'solid-js';
import type { Section, Rabbi } from './AnalysisPanel';
import type { HalachaTopic } from './HalachaPanel';
import type { AggadataStory } from './AggadataDetector';
import { GENERATION_BY_ID, type GenerationId } from './generations';
import type { IdentifiedRabbi } from './dafContext';
import type { CommentaryComment } from './CommentaryPicker';

export type SidebarContent =
  | { kind: 'argument'; section: Section; index: number }
  | { kind: 'halacha'; topic: HalachaTopic; index: number }
  | { kind: 'aggadata'; story: AggadataStory; index: number }
  | { kind: 'rabbi'; rabbi: IdentifiedRabbi }
  | { kind: 'commentary'; workTitle: string; workTitleHe: string; segIdx: number; comments: CommentaryComment[] };

export interface ArgumentSidebarProps {
  content: SidebarContent | null;
  tractate: string;
  page: string;
  activeRabbi: string | null;
  onClose: () => void;
  onHighlightRabbi: (name: string | null) => void;
  generationByName: Map<string, GenerationId>;
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
        {props.rabbi.role}
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
              {r().summary}
            </div>
          </div>
        );
      }}
    </Show>
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
                  : c().kind === 'rabbi' ? 'Rabbi'
                  : 'Commentary'}
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
                      {section.summary}
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
                        {r.bio}
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
                      {story.summary}
                    </p>
                    <Show when={story.excerpt}>
                      <div style={{
                        padding: '0.55rem 0.7rem',
                        background: '#fafaf7',
                        border: '1px solid #eae8e0',
                        'border-radius': '4px',
                      }}>
                        <div style={{
                          'font-size': '0.68rem',
                          'text-transform': 'uppercase',
                          'letter-spacing': '0.06em',
                          'font-weight': 600,
                          color: '#888',
                          'margin-bottom': '0.3rem',
                        }}>
                          Opens with
                        </div>
                        <p dir="rtl" lang="he" style={{
                          margin: 0,
                          'font-family': '"Mekorot Vilna", serif',
                          'font-size': '1rem',
                          color: '#444',
                          'line-height': 1.6,
                        }}>
                          {story.excerpt}
                        </p>
                      </div>
                    </Show>
                  </div>
                );
              })()}
            </Show>

            <Show when={c().kind === 'commentary'}>
              {(() => {
                const cc = c() as Extract<SidebarContent, { kind: 'commentary' }>;
                return (
                  <div>
                    <h3 style={{ margin: '0 0 0.15rem', 'font-size': '1.05rem', color: '#1e40af' }}>
                      {cc.workTitle}
                    </h3>
                    <Show when={cc.workTitleHe}>
                      <p dir="rtl" lang="he" style={{
                        margin: '0 0 0.4rem', 'font-family': '"Mekorot Vilna", serif',
                        'font-size': '1rem', color: '#666',
                      }}>{cc.workTitleHe}</p>
                    </Show>
                    <div style={{ 'font-size': '0.72rem', color: '#999', 'margin-bottom': '0.6rem' }}>
                      {cc.comments.length} comment{cc.comments.length === 1 ? '' : 's'} on segment #{cc.segIdx + 1}
                    </div>
                    <For each={cc.comments}>
                      {(comment, i) => (
                        <div
                          style={{
                            padding: '0.6rem 0.8rem',
                            margin: '0 0 0.5rem',
                            background: '#fcfcfa',
                            border: '1px solid #eee',
                            'border-radius': '4px',
                          }}
                        >
                          <div style={{ 'font-size': '0.7rem', color: '#999', 'margin-bottom': '0.35rem' }}>
                            #{i() + 1} · {comment.sourceRef}
                          </div>
                          <Show when={comment.textHe}>
                            <div
                              dir="rtl"
                              lang="he"
                              style={{
                                'font-family': '"Mekorot Vilna", serif',
                                'font-size': '0.95rem',
                                'line-height': 1.55,
                                color: '#333',
                                'margin-bottom': comment.textEn ? '0.5rem' : 0,
                              }}
                              innerHTML={comment.textHe}
                            />
                          </Show>
                          <Show when={comment.textEn}>
                            <div
                              style={{
                                'font-size': '0.82rem',
                                color: '#555',
                                'line-height': 1.5,
                              }}
                              innerHTML={comment.textEn}
                            />
                          </Show>
                          <Show when={!comment.textHe && !comment.textEn}>
                            <div style={{ color: '#999', 'font-style': 'italic', 'font-size': '0.8rem' }}>
                              (No text available)
                            </div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                );
              })()}
            </Show>
        </aside>
      )}
    </Show>
  );
}
