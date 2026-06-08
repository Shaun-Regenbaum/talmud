import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from 'solid-js';
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
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildParagraphs(verses: Verse[], nikud: boolean, labels?: Map<number, string>): string[] {
  let joined = verses
    .map((v) => {
      const label = labels?.get(v.n);
      // A section-start verse number doubles as the margin anchor's measurable
      // point (.evt-pt); the label itself is positioned in the margin by App.
      const cls = label ? 'vnum evt-pt' : 'vnum';
      const attrs = label ? ` data-v="${v.n}" data-label="${escapeHtml(label)}"` : '';
      return `<span class="${cls}"${attrs}>${hebrewNumeral(v.n)}</span> ${v.he}`;
    })
    .join(' ');
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
  lang: 'en' | 'he';
}

function readUrl(): Loc {
  const p = new URLSearchParams(window.location.search);
  const book = p.get('book') ?? 'Genesis';
  const chapter = Number(p.get('chapter') ?? '1') || 1;
  const view: View = p.get('view') === 'mikraot' ? 'mikraot' : 'scroll';
  const nikud = p.get('nikud') !== '0';
  const lang: 'en' | 'he' = p.get('lang') === 'he' ? 'he' : 'en';
  return { book: BOOKS.some((b) => b.name === book) ? book : 'Genesis', chapter, view, nikud, lang };
}

async function fetchChapter(loc: { book: string; chapter: number }): Promise<Chapter> {
  const res = await fetch(`/api/chapter/${encodeURIComponent(loc.book)}/${loc.chapter}`);
  const data = (await res.json()) as Chapter;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

interface EventSection {
  verse: number;
  en: string;
  he: string;
}
interface Parsha {
  name: string;
  heName: string;
  ref: string;
  book: string;
  chapter: number;
}
async function fetchParsha(): Promise<Parsha | null> {
  try {
    const res = await fetch('/api/parsha');
    return res.ok ? ((await res.json()) as Parsha) : null;
  } catch {
    return null;
  }
}
/** The event/section labels for a chapter (first producer). Best-effort: a
 *  failure just means no margin anchors — the text still renders. */
async function fetchEvents(loc: { book: string; chapter: number }): Promise<EventSection[]> {
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(loc.book)}/${loc.chapter}`);
    const data = (await res.json()) as { sections?: EventSection[] };
    return res.ok && Array.isArray(data.sections) ? data.sections : [];
  } catch {
    return [];
  }
}

export function App(): JSX.Element {
  const [loc, setLoc] = createSignal(readUrl());

  const writeUrl = (l: Loc) => {
    const p = new URLSearchParams({ book: l.book, chapter: String(l.chapter) });
    if (l.view === 'mikraot') p.set('view', 'mikraot');
    if (!l.nikud) p.set('nikud', '0');
    if (l.lang === 'he') p.set('lang', 'he');
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
  const [events] = createResource(chapterKey, fetchEvents);
  const [parsha] = createResource(fetchParsha);

  window.addEventListener('popstate', () => setLoc(readUrl()));

  const goto = (book: string, chapter: number) => update({ book, chapter }, true);

  const paragraphs = createMemo(() => {
    const ch = data();
    if (!ch) return [];
    const he = loc().lang === 'he';
    const labels = new Map(
      (events() ?? []).map((s) => [s.verse, (he ? s.he : s.en) || s.en || s.he] as const),
    );
    return buildParagraphs(ch.verses, loc().nikud, labels);
  });

  // Margin anchors: measure each section-start verse number (.evt-pt) and pin its
  // event label in the outer margin at that vertical position, on whichever side
  // its column faces. Re-measured on reflow (resize / font load / nikud toggle).
  let scrollMain: HTMLElement | undefined;
  let scrollBand: HTMLElement | undefined;
  const [anchors, setAnchors] = createSignal<{ v: string; label: string; top: number; side: 'left' | 'right' }[]>([]);
  const [reflow, setReflow] = createSignal(0);

  const measure = () => {
    if (loc().view !== 'scroll' || !scrollMain || !scrollBand) {
      setAnchors([]);
      return;
    }
    const m = scrollMain.getBoundingClientRect();
    const out: { v: string; label: string; top: number; side: 'left' | 'right' }[] = [];
    scrollBand.querySelectorAll<HTMLElement>('.evt-pt').forEach((pt) => {
      const r = pt.getBoundingClientRect();
      if (!r.height) return;
      const side: 'left' | 'right' = r.left + r.width / 2 - m.left < m.width / 2 ? 'left' : 'right';
      out.push({ v: pt.dataset.v ?? '', label: pt.dataset.label ?? '', top: r.top - m.top, side });
    });
    setAnchors(out);
  };

  onMount(() => {
    const bump = () => setReflow((n) => n + 1);
    window.addEventListener('resize', bump);
    document.fonts?.ready.then(bump);
    onCleanup(() => window.removeEventListener('resize', bump));
  });

  createEffect(() => {
    // dependencies that change the layout of .evt-pt points
    paragraphs();
    reflow();
    loc().view;
    loc().nikud;
    requestAnimationFrame(() => requestAnimationFrame(measure));
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

        <Show when={parsha()}>
          {(p) => (
            <button
              class="parsha-btn"
              onClick={() => goto(p().book, p().chapter)}
              title={`This week's parsha — ${p().name} (${p().ref})`}
            >
              {loc().lang === 'he' ? p().heName || p().name : p().name}
            </button>
          )}
        </Show>

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

        <div class="lang-toggle" role="group" aria-label="Language">
          <button classList={{ active: loc().lang === 'en' }} onClick={() => update({ lang: 'en' })}>EN</button>
          <button classList={{ active: loc().lang === 'he' }} onClick={() => update({ lang: 'he' })}>עב</button>
        </div>

        <a class="usage-link" href="/usage" title="LLM usage">usage</a>

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
          <main class="scroll-main" ref={(el) => (scrollMain = el)}>
            <div class="scroll-band" dir="rtl" ref={(el) => (scrollBand = el)}>
              <For each={paragraphs()}>{(p) => <p class="scroll-para" innerHTML={p} />}</For>
            </div>
            <For each={anchors()}>
              {(a) => (
                <button
                  class="evt-margin"
                  classList={{ 'evt-left': a.side === 'left', 'evt-right': a.side === 'right' }}
                  style={{ top: `${a.top}px` }}
                  data-v={a.v}
                  title={`${a.label} (verse ${a.v})`}
                >
                  {a.label}
                </button>
              )}
            </For>
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
