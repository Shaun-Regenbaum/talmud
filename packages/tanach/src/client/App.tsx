import { createMemo, createResource, createSignal, For, Show, type JSX } from 'solid-js';
import { BOOKS, SECTIONS, type Section } from '../lib/books.ts';
import { MikraotGedolot } from './MikraotGedolot.tsx';

interface Verse {
  n: number;
  he: string;
  en: string;
}
interface Chapter {
  book: string;
  chapter: number;
  ref: string;
  heRef: string;
  verses: Verse[];
  next: string | null;
  prev: string | null;
  error?: string;
}

type View = 'reading' | 'scroll' | 'mikraot';

/** Parse a Sefaria section ref ("Genesis 2", "I Samuel 3") into book + chapter. */
function parseRef(ref: string): { book: string; chapter: number } | null {
  const m = ref.match(/^(.*?)\s+(\d+)$/);
  if (!m) return null;
  return { book: m[1], chapter: Number(m[2]) };
}

/** Drop niqqud + cantillation (te'amim) for the bare-consonant ktav-STAM look.
 *  Maqaf (U+05BE) becomes a space so joined words separate; other points/accents
 *  are removed. Letters (U+05D0–U+05EA) and HTML tags are left intact. */
function stripNikud(html: string): string {
  return html.replace(/־/g, ' ').replace(/[֑-ֽֿ-ׇ]/g, '');
}

/** Turn Sefaria's parsha markers into block/inline breaks for the scroll. */
function renderParshiyot(html: string): string {
  return html
    .replace(/\{[פש]\}/g, '<span class="parsha-open"></span>')
    .replace(/\{ס\}/g, '<span class="parsha-closed"></span>');
}

interface Loc {
  book: string;
  chapter: number;
  view: View;
  nikud: boolean;
}

function readUrl(): Loc {
  const p = new URLSearchParams(window.location.search);
  const book = p.get('book') ?? 'Genesis';
  const chapter = Number(p.get('chapter') ?? '1') || 1;
  const vp = p.get('view');
  const view: View = vp === 'scroll' ? 'scroll' : vp === 'mikraot' ? 'mikraot' : 'reading';
  const nikud = p.get('nikud') !== '0';
  return { book: BOOKS.some((b) => b.name === book) ? book : 'Genesis', chapter, view, nikud };
}

async function fetchChapter(loc: { book: string; chapter: number }): Promise<Chapter> {
  const res = await fetch(`/api/chapter/${encodeURIComponent(loc.book)}/${loc.chapter}`);
  const data = (await res.json()) as Chapter;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export function App(): JSX.Element {
  const [loc, setLoc] = createSignal(readUrl());

  const writeUrl = (l: Loc) => {
    const p = new URLSearchParams({ book: l.book, chapter: String(l.chapter) });
    if (l.view !== 'reading') p.set('view', l.view);
    if (!l.nikud) p.set('nikud', '0');
    window.history.pushState(null, '', `?${p.toString()}`);
  };
  const update = (patch: Partial<Loc>, scroll = false) => {
    const next = { ...loc(), ...patch };
    writeUrl(next);
    setLoc(next);
    if (scroll) window.scrollTo(0, 0);
  };

  // Re-fetch only when book/chapter change (view/nikud are render-only).
  const chapterKey = createMemo(() => ({ book: loc().book, chapter: loc().chapter }), undefined, {
    equals: (a, b) => a.book === b.book && a.chapter === b.chapter,
  });
  const [data] = createResource(chapterKey, fetchChapter);

  window.addEventListener('popstate', () => setLoc(readUrl()));

  const heName = (name: string) => BOOKS.find((b) => b.name === name)?.he ?? name;
  const goto = (book: string, chapter: number) => update({ book, chapter }, true);

  const scrollHtml = createMemo(() => {
    const ch = data();
    if (!ch) return '';
    const joined = ch.verses.map((v) => v.he).join(' ');
    const withParsha = renderParshiyot(joined);
    return loc().nikud ? withParsha : stripNikud(withParsha);
  });

  return (
    <div class="app" classList={{ 'view-scroll': loc().view === 'scroll', 'view-mikraot': loc().view === 'mikraot' }}>
      <header class="topbar">
        <span class="brand">Tanach</span>
        <select class="book-select" value={loc().book} onChange={(e) => goto(e.currentTarget.value, 1)}>
          <For each={SECTIONS}>
            {(section: Section) => (
              <optgroup label={section}>
                <For each={BOOKS.filter((b) => b.section === section)}>
                  {(b) => <option value={b.name}>{b.name} · {b.he}</option>}
                </For>
              </optgroup>
            )}
          </For>
        </select>

        <div class="view-toggle" role="group" aria-label="View">
          <button classList={{ active: loc().view === 'reading' }} onClick={() => update({ view: 'reading' })}>
            Reading
          </button>
          <button classList={{ active: loc().view === 'scroll' }} onClick={() => update({ view: 'scroll' })}>
            Scroll
          </button>
          <button classList={{ active: loc().view === 'mikraot' }} onClick={() => update({ view: 'mikraot' })}>
            Mikraot Gedolot
          </button>
        </div>

        <Show when={loc().view === 'scroll'}>
          <button class="nikud-toggle" onClick={() => update({ nikud: !loc().nikud })}>
            {loc().nikud ? 'נִקּוּד' : 'נקוד'}
          </button>
        </Show>

        <div class="chapter-nav">
          <button disabled={loc().chapter <= 1} onClick={() => goto(loc().book, loc().chapter - 1)}>‹</button>
          <span class="chapter-label">ch. {loc().chapter}</span>
          <button onClick={() => goto(loc().book, loc().chapter + 1)}>›</button>
        </div>
      </header>

      <Show when={data.loading}>
        <p class="status">Loading…</p>
      </Show>
      <Show when={data.error}>
        <p class="status error">{(data.error as Error)?.message}</p>
      </Show>

      {/* Reading view — verses with translation */}
      <Show when={loc().view === 'reading' && data()}>
        {(ch) => (
          <main class="reader">
            <h1 class="chapter-head">
              <span class="he" dir="rtl">{heName(loc().book)} {loc().chapter}</span>
              <span class="en">{loc().book} {loc().chapter}</span>
            </h1>
            <ol class="verses">
              <For each={ch().verses}>
                {(v) => (
                  <li class="verse">
                    <span class="vnum">{v.n}</span>
                    <span class="he" dir="rtl" innerHTML={v.he} />
                    <span class="en" innerHTML={v.en} />
                  </li>
                )}
              </For>
            </ol>
            <ChapterFoot ch={ch()} goto={goto} />
          </main>
        )}
      </Show>

      {/* Mikraot Gedolot — pasuk framed by Rashi + Onkelos (daf-renderer) */}
      <Show when={loc().view === 'mikraot'}>
        <MikraotGedolot book={loc().book} chapter={loc().chapter} />
      </Show>

      {/* Scroll view — Sefer Torah band */}
      <Show when={loc().view === 'scroll' && data()}>
        {(ch) => (
          <main class="scroll-main">
            <div class="scroll-band" dir="rtl" innerHTML={scrollHtml()} />
            <div class="scroll-caption">
              <span class="he">{ch().heRef}</span>
              <ChapterFoot ch={ch()} goto={goto} />
            </div>
          </main>
        )}
      </Show>
    </div>
  );
}

function ChapterFoot(props: { ch: Chapter; goto: (b: string, c: number) => void }): JSX.Element {
  const nav = (ref: string | null, label: (r: string) => string) => (
    <Show when={ref} fallback={<span />}>
      {(r) => {
        const p = parseRef(r());
        return p ? <button onClick={() => props.goto(p.book, p.chapter)}>{label(r())}</button> : <span />;
      }}
    </Show>
  );
  return (
    <nav class="chapter-foot">
      {nav(props.ch.prev, (r) => `‹ ${r}`)}
      {nav(props.ch.next, (r) => `${r} ›`)}
    </nav>
  );
}
