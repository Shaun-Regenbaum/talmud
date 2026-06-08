import { createMemo, createResource, createSignal, For, Show, type JSX } from 'solid-js';
import { BOOKS, SECTIONS, type Section } from '../lib/books.ts';
import { hebrewNumeral } from '../lib/hebrew.ts';
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

type View = 'scroll' | 'mikraot';

/** Parse a Sefaria section ref ("Genesis 2", "I Samuel 3") into book + chapter. */
function parseRef(ref: string): { book: string; chapter: number } | null {
  const m = ref.match(/^(.*?)\s+(\d+)$/);
  if (!m) return null;
  return { book: m[1], chapter: Number(m[2]) };
}

/** Drop niqqud + cantillation for the bare ktav-STAM look. Maqaf -> space. */
function stripNikud(html: string): string {
  return html.replace(/־/g, ' ').replace(/[֑-ֽֿ-ׇ]/g, '');
}

const PETUCHA = '\u0001';
const SETUMA = '\u0002';

/**
 * Build the scroll's paragraphs from a chapter's verses, honouring the Masoretic
 * parsha breaks exactly as a Torah scroll lays them out (Sefaria marks them with
 * `mam-spi-pe` / `mam-spi-samekh` spans, also matched bare as a fallback):
 *   - PETUCHA (פ, "open"): the line ends and the next portion starts on a NEW
 *     line -> a paragraph boundary (justify leaves the last line short, like the
 *     scroll's blank line-remainder).
 *   - SETUMA (ס, "closed"): a gap of a few letters WITHIN the line, text
 *     continuing on the same line -> an inline tab.
 */
function buildParagraphs(verses: Verse[], nikud: boolean): string[] {
  let joined = verses.map((v) => `<span class="vnum">${hebrewNumeral(v.n)}</span> ${v.he}`).join(' ');
  joined = joined
    .replace(/(?:&nbsp;|\s)*<span class="mam-spi-pe[^"]*">\{פ\}<\/span>/g, PETUCHA)
    .replace(/(?:&nbsp;|\s)*<span class="mam-spi-samekh[^"]*">\{ס\}<\/span>/g, SETUMA)
    .replace(/(?:&nbsp;|\s)*\{פ\}/g, PETUCHA)
    .replace(/(?:&nbsp;|\s)*\{[סש]\}/g, SETUMA)
    .replace(/&nbsp;/g, ' ')
    .replace(new RegExp(SETUMA, 'g'), '<span class="setuma"></span>');
  let paras = joined
    .split(PETUCHA)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!nikud) paras = paras.map(stripNikud);
  return paras;
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
  const view: View = p.get('view') === 'mikraot' ? 'mikraot' : 'scroll';
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
    if (l.view === 'mikraot') p.set('view', 'mikraot');
    if (!l.nikud) p.set('nikud', '0');
    window.history.pushState(null, '', `?${p.toString()}`);
  };
  const update = (patch: Partial<Loc>, scroll = false) => {
    const next = { ...loc(), ...patch };
    writeUrl(next);
    setLoc(next);
    if (scroll) window.scrollTo(0, 0);
  };

  const chapterKey = createMemo(() => ({ book: loc().book, chapter: loc().chapter }), undefined, {
    equals: (a, b) => a.book === b.book && a.chapter === b.chapter,
  });
  const [data] = createResource(chapterKey, fetchChapter);

  window.addEventListener('popstate', () => setLoc(readUrl()));

  const goto = (book: string, chapter: number) => update({ book, chapter }, true);

  const paragraphs = createMemo(() => {
    const ch = data();
    return ch ? buildParagraphs(ch.verses, loc().nikud) : [];
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

      {/* Mikraot Gedolot — pasuk framed by Rashi + Onkelos (daf-renderer) */}
      <Show when={loc().view === 'mikraot'}>
        <MikraotGedolot book={loc().book} chapter={loc().chapter} />
      </Show>

      {/* Scroll — Sefer Torah columns with Masoretic parsha breaks */}
      <Show when={loc().view === 'scroll' && data()}>
        {(ch) => (
          <main class="scroll-main">
            <div class="scroll-band" dir="rtl">
              <For each={paragraphs()}>{(p) => <p class="scroll-para" innerHTML={p} />}</For>
            </div>
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
