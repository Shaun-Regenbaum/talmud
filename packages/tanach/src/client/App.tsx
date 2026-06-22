import { Button } from '@corpus/ui/Button';
import { Drawer } from '@corpus/ui/Drawer';
import { fitBbox, GeoMap } from '@corpus/ui/GeoMap';
import { LangToggle } from '@corpus/ui/LangToggle';
import { Pill, PillRow } from '@corpus/ui/Pill';
import { Prose } from '@corpus/ui/Prose';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { BOOKS, SECTIONS, type Section } from '../lib/books.ts';
import { hebrewNumeral } from '../lib/hebrew.ts';
import {
  KIND_GLYPH,
  MIDRASH_MIN,
  type SourceKind,
  type SourceVerse,
  verseKinds,
} from '../lib/sources.ts';
import { ChapterLoadProgress } from './ChapterLoadProgress.tsx';
import { reportLoad, resetChapterLoad } from './chapterLoad.ts';
import { Inspector } from './Inspector.tsx';
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

/** Margin-anchor box width + gap from the text band (used both to place the
 *  label and to decide whether it fits in the margin). */
const ANCHOR_W = 140;
// Gap from the text band to the dot (the verse tick sits close to the text); the
// label itself is pushed further into the margin by .evt-margin padding.
const ANCHOR_GAP = 26;
// Source icons (rishonim, ...) live in a thin lane right at the band edge,
// inside the event-anchor labels.
const ICON_SIZE = 14;
const ICON_GAP = 4;

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
      return `<span class="vtext" data-vn="${v.n}"><span class="${cls}"${attrs}>${hebrewNumeral(v.n)}</span> ${v.he}</span>`;
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
  // Mikraot Gedolot is hidden for now — force the default scroll view.
  const view: View = 'scroll';
  const nikud = p.get('nikud') !== '0';
  const lang: 'en' | 'he' = p.get('lang') === 'he' ? 'he' : 'en';
  return {
    book: BOOKS.some((b) => b.name === book) ? book : 'Genesis',
    chapter,
    view,
    nikud,
    lang,
  };
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
/** The Hebrew name of a book, for the Hebrew-mode chapter refs. */
function heBook(name: string): string {
  return BOOKS.find((b) => b.name === name)?.he ?? name;
}

/** Israel and the Diaspora occasionally read different weekly portions; pick by
 *  the browser's time zone (Asia/Jerusalem => Israel). */
function inIsrael(): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Jerusalem';
  } catch {
    return false;
  }
}

async function fetchParsha(): Promise<Parsha | null> {
  try {
    const res = await fetch(`/api/parsha?loc=${inIsrael() ? 'israel' : 'diaspora'}`);
    return res.ok ? ((await res.json()) as Parsha) : null;
  } catch {
    return null;
  }
}

interface SectionNote {
  en: string;
  he: string;
}
/** A whole-chapter pill the reader can open from the perek-pills row. */
type PerekPill = 'overview' | 'geography' | 'tidbit';
interface Overview {
  book: string;
  chapter: number;
  titleEn: string;
  titleHe: string;
  en: string;
  he: string;
}
interface GeoPlace {
  en: string;
  he: string;
  lat: number;
  lng: number;
  /** Verse number(s) where the place is named — clicking the pin highlights them. */
  verses: number[];
}
interface PerekGeography {
  book: string;
  chapter: number;
  places: GeoPlace[];
}
interface PerekTidbit {
  book: string;
  chapter: number;
  flavor: string;
  titleEn: string;
  titleHe: string;
  en: string;
  he: string;
  textConfidence: string;
  readingConfidence: string;
}
/** The perek-pills, in display order. */
const PEREK_PILLS: { id: PerekPill; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'geography', label: 'Geography' },
  { id: 'tidbit', label: 'Tidbit' },
];
const PILL_KIND: Record<PerekPill, string> = {
  overview: 'Overview',
  geography: 'Geography',
  tidbit: 'Tidbit',
};

interface CommentaryEntry {
  key: string;
  en: string;
  heName: string;
  he: string[];
  enText: string[];
}
interface CommentaryResponse {
  book: string;
  chapter: number;
  verse: number;
  commentaries: CommentaryEntry[];
}
interface SourceIdx {
  verses: SourceVerse[];
}
interface GemaraResp {
  count: number;
  passages: { ref: string; he: string; en: string }[];
}
const SECTION_TITLE: Record<SourceKind, string> = {
  rishonim: 'Commentary',
  gemara: 'In the Talmud',
  midrash: 'Midrash',
};
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
  const [sourcesIndex] = createResource(chapterKey, async (k) => {
    try {
      const res = await fetch(`/api/sources-index/${encodeURIComponent(k.book)}/${k.chapter}`);
      return res.ok ? ((await res.json()) as SourceIdx) : null;
    } catch {
      return null;
    }
  });
  const richSet = createMemo(
    () => new Set((sourcesIndex()?.verses ?? []).filter((v) => v.rich).map((v) => v.verse)),
  );

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
  const [anchors, setAnchors] = createSignal<
    { v: string; label: string; top: number; left: number; side: 'left' | 'right' }[]
  >([]);
  const [verseIcons, setVerseIcons] = createSignal<
    { v: number; top: number; left: number; side: 'left' | 'right'; kinds: SourceKind[] }[]
  >([]);
  const [reflow, setReflow] = createSignal(0);
  const bumpReflow = () => setReflow((n) => n + 1);
  // Re-measure on ANY geometry change of the text band. The reading column is
  // CSS multi-column (column-count: 2), which rebalances as fonts + content
  // settle — moving verses near the column break into the other column AFTER
  // the initial measure. A one-shot fonts.ready + double-rAF misses that late
  // reflow and strands the margin labels/icons at stale positions (e.g. piled
  // at the bottom). A ResizeObserver on the band catches every reflow.
  const bandObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => bumpReflow()) : null;
  onCleanup(() => bandObserver?.disconnect());

  const measure = () => {
    if (loc().view !== 'scroll' || !scrollMain || !scrollBand) {
      setAnchors([]);
      setVerseIcons([]);
      return;
    }
    const m = scrollMain.getBoundingClientRect();
    const b = scrollBand.getBoundingClientRect();
    const out: { v: string; label: string; top: number; left: number; side: 'left' | 'right' }[] =
      [];
    scrollBand.querySelectorAll<HTMLElement>('.evt-pt').forEach((pt) => {
      const r = pt.getBoundingClientRect();
      if (!r.height) return;
      // Side = which half of the band the verse sits in. Position the label just
      // OUTSIDE the band on that side; skip it when the margin can't hold it (so
      // it never overlaps the text — at narrow widths the layout drops to one
      // column, which widens the margins and brings the anchors back).
      const side: 'left' | 'right' = r.left + r.width / 2 < m.left + m.width / 2 ? 'left' : 'right';
      const left =
        side === 'right' ? b.right - m.left + ANCHOR_GAP : b.left - m.left - ANCHOR_W - ANCHOR_GAP;
      if (left < 4 || left + ANCHOR_W > m.width - 4) return;
      out.push({
        v: pt.dataset.v ?? '',
        label: pt.dataset.label ?? '',
        top: r.top - m.top,
        left,
        side,
      });
    });
    // De-collide labels per side: nudge a label down when it would overlap the
    // one above (height estimated from text length wrapped to ANCHOR_W), like
    // the Talmud gutter stack.
    const estH = (label: string) => Math.max(1, Math.ceil(label.length / 16)) * 15 + 12;
    for (const sd of ['left', 'right'] as const) {
      let prevBottom = -Infinity;
      for (const a of out.filter((x) => x.side === sd).sort((x, y) => x.top - y.top)) {
        if (a.top < prevBottom + 6) a.top = prevBottom + 6;
        prevBottom = a.top + estH(a.label);
      }
    }
    setAnchors(out);

    // Source icons (ר/ג/מ) for each flagged verse, laid out as a HORIZONTAL row
    // at the verse's line (like the Talmud gutter clusters) — one short row per
    // verse, ~one icon tall, so consecutive verses never overlap or overflow.
    const kindsByVerse = new Map<number, SourceKind[]>();
    for (const v of sourcesIndex()?.verses ?? []) {
      const k = verseKinds(v);
      if (k.length) kindsByVerse.set(v.verse, k);
    }
    const icons: {
      v: number;
      top: number;
      left: number;
      side: 'left' | 'right';
      kinds: SourceKind[];
    }[] = [];
    if (kindsByVerse.size) {
      scrollBand.querySelectorAll<HTMLElement>('.vtext').forEach((vt) => {
        const vn = Number(vt.dataset.vn);
        const kinds = kindsByVerse.get(vn);
        if (!kinds) return;
        const r = vt.getBoundingClientRect();
        if (!r.height) return;
        // One-icon-wide lane: the stack is a collapsed vertical deck (icons
        // overlap, a sliver of each shows) that fans out on hover.
        const side: 'left' | 'right' =
          r.left + r.width / 2 < m.left + m.width / 2 ? 'left' : 'right';
        const left =
          side === 'right' ? b.right - m.left + ICON_GAP : b.left - m.left - ICON_SIZE - ICON_GAP;
        if (left < 2 || left + ICON_SIZE > m.width - 2) return;
        icons.push({ v: vn, top: r.top - m.top, left, side, kinds });
      });
    }
    setVerseIcons(icons);
  };

  onMount(() => {
    window.addEventListener('resize', bumpReflow);
    document.fonts?.ready.then(bumpReflow);
    onCleanup(() => window.removeEventListener('resize', bumpReflow));
  });

  createEffect(() => {
    // dependencies that change the layout of .evt-pt points
    paragraphs();
    reflow();
    loc().view;
    loc().nikud;
    richSet();
    sourcesIndex();
    requestAnimationFrame(() => requestAnimationFrame(measure));
  });

  // Section note popover: clicking a margin anchor opens a short p'shat note for
  // that section's verse range (start..next section - 1).
  const [selected, setSelected] = createSignal<{
    start: number;
    end: number;
    label: string;
    top: number;
    side: 'left' | 'right';
  } | null>(null);
  const openAnchor = (a: { v: string; label: string; top: number; side: 'left' | 'right' }) => {
    const start = Number(a.v);
    const secs = (events() ?? []).slice().sort((x, y) => x.verse - y.verse);
    const idx = secs.findIndex((s) => s.verse === start);
    const end =
      idx >= 0 && idx + 1 < secs.length
        ? secs[idx + 1].verse - 1
        : (data()?.verses.length ?? start);
    setSelected({ start, end, label: a.label, top: a.top, side: a.side });
  };
  const [note] = createResource(selected, async (sel) => {
    const l = loc();
    const url = `/api/note/${encodeURIComponent(l.book)}/${l.chapter}/${sel.start}?end=${sel.end}&label=${encodeURIComponent(sel.label)}`;
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as SectionNote) : null;
  });
  createEffect(() => {
    chapterKey();
    setSelected(null);
  });

  // Word / phrase translation: select Hebrew in the text (double-click a word or
  // drag a phrase) -> an English gloss popup at the selection.
  const [wordSel, setWordSel] = createSignal<{
    he: string;
    ctx: string;
    x: number;
    y: number;
  } | null>(null);
  const [translation] = createResource(wordSel, async (w) => {
    const res = await fetch(
      `/api/translate?q=${encodeURIComponent(w.he)}&ctx=${encodeURIComponent(w.ctx)}`,
    );
    return res.ok ? (((await res.json()) as { translation?: string }).translation ?? null) : null;
  });
  const onTextSelect = () => {
    const g = window.getSelection();
    const text = g?.toString().trim() ?? '';
    if (!g || g.rangeCount === 0 || !text || text.length > 80 || !/[א-ת]/.test(text)) return;
    const r = g.getRangeAt(0).getBoundingClientRect();
    const ctx = (g.anchorNode?.parentElement?.textContent ?? '').replace(/\s+/g, ' ').trim();
    setWordSel({ he: text, ctx, x: r.left + r.width / 2, y: r.bottom });
  };
  onMount(() => {
    const clear = () => setWordSel(null);
    window.addEventListener('scroll', clear, { passive: true });
    // Dismiss the gloss popup on click-away or Escape. A fresh selection still
    // works: the mousedown clears the old popup, the following mouseup
    // (onTextSelect) opens a new one for the new selection.
    const onPointerDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('.xlate-pop')) return;
      setWordSel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWordSel(null);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    onCleanup(() => {
      window.removeEventListener('scroll', clear);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    });
  });
  createEffect(() => {
    chapterKey();
    setWordSel(null);
  });

  // Highlight the relevant verses: a section's range (note popover), the single
  // verse whose source drawer is open (rishonim / gemara / midrash), or the
  // verse(s) a clicked Geography place is named in.
  createEffect(() => {
    const sel = selected();
    const src = source();
    const pv = new Set(placeVerses());
    paragraphs();
    requestAnimationFrame(() => {
      if (!scrollBand) return;
      scrollBand.querySelectorAll('.vtext.hl').forEach((e) => {
        e.classList.remove('hl');
      });
      scrollBand.querySelectorAll<HTMLElement>('.vtext').forEach((e) => {
        const vn = Number(e.dataset.vn);
        const inNote = sel && vn >= sel.start && vn <= sel.end;
        const inSource = src && vn === src.verse;
        if (inNote || inSource || pv.has(vn)) e.classList.add('hl');
      });
    });
  });

  // Verse-sources drawer: shows ONE source kind at a time (rishonim / gemara /
  // midrash) for the selected verse. Switching verse or kind remounts the panel
  // (it empties + repopulates rather than scrolling stale content).
  const [source, setSource] = createSignal<{ verse: number; kind: SourceKind } | null>(null);
  const openSource = (verse: number, kind: SourceKind) => setSource({ verse, kind });
  const onTextClick = (e: MouseEvent) => {
    const num = (e.target as HTMLElement).closest('.vnum');
    if (!num) return;
    const vt = num.closest('.vtext') as HTMLElement | null;
    const vn = vt ? Number(vt.dataset.vn) : NaN;
    if (vn) setSource({ verse: vn, kind: 'rishonim' });
  };
  const idxByVerse = createMemo(() => {
    const map = new Map<number, SourceVerse>();
    for (const v of sourcesIndex()?.verses ?? []) map.set(v.verse, v);
    return map;
  });
  // A resource source that only resolves when the drawer is showing `kind`.
  const whenKind = (kind: SourceKind) => () => {
    const s = source();
    return s && s.kind === kind
      ? { book: loc().book, chapter: loc().chapter, verse: s.verse }
      : null;
  };
  const [commentary] = createResource(whenKind('rishonim'), async (k) => {
    const res = await fetch(
      `/api/commentary/${encodeURIComponent(k.book)}/${k.chapter}/${k.verse}`,
    );
    return res.ok ? ((await res.json()) as CommentaryResponse) : null;
  });
  const [synthesis] = createResource(
    () => {
      const s = source();
      return s && s.kind === 'rishonim' && richSet().has(s.verse)
        ? { book: loc().book, chapter: loc().chapter, verse: s.verse }
        : null;
    },
    async (k) => {
      const res = await fetch(
        `/api/synthesis/${encodeURIComponent(k.book)}/${k.chapter}/${k.verse}`,
      );
      return res.ok ? ((await res.json()) as SectionNote) : null;
    },
  );
  const [gemara] = createResource(whenKind('gemara'), async (k) => {
    const res = await fetch(`/api/gemara/${encodeURIComponent(k.book)}/${k.chapter}/${k.verse}`);
    return res.ok ? ((await res.json()) as GemaraResp) : null;
  });
  const [midrash] = createResource(whenKind('midrash'), async (k) => {
    const res = await fetch(`/api/midrash/${encodeURIComponent(k.book)}/${k.chapter}/${k.verse}`);
    return res.ok ? ((await res.json()) as GemaraResp) : null;
  });
  const [midrashSynth] = createResource(
    () => {
      const s = source();
      return s && s.kind === 'midrash' && (idxByVerse().get(s.verse)?.midrash ?? 0) >= MIDRASH_MIN
        ? { book: loc().book, chapter: loc().chapter, verse: s.verse }
        : null;
    },
    async (k) => {
      const res = await fetch(
        `/api/midrash-synthesis/${encodeURIComponent(k.book)}/${k.chapter}/${k.verse}`,
      );
      return res.ok ? ((await res.json()) as SectionNote) : null;
    },
  );
  createEffect(() => {
    chapterKey();
    setSource(null);
  });

  // Perek-level pills (Overview, …): a chapter-scoped drawer, mutually
  // exclusive with the verse-source drawer (both are the same fixed right
  // panel). Opening a pill lazily fetches its enrichment (warm in KV after the
  // first reader); the resource only fires while its pill is open.
  const [perekPill, setPerekPill] = createSignal<PerekPill | null>(null);
  // The inspector (what's cached for this chapter + cost) — another tenant of
  // the one fixed right panel, so it's mutually exclusive with the pills and
  // the verse-source drawer.
  const [inspectOpen, setInspectOpen] = createSignal(false);
  const openPill = (id: PerekPill) => {
    setSource(null);
    setSelected(null);
    setInspectOpen(false);
    setPerekPill((cur) => (cur === id ? null : id));
  };
  const toggleInspect = () => {
    setSource(null);
    setSelected(null);
    setPerekPill(null);
    setInspectOpen((v) => !v);
  };
  const [overview] = createResource(
    () => (perekPill() === 'overview' ? chapterKey() : undefined),
    async (k) => {
      const res = await fetch(`/api/overview/${encodeURIComponent(k.book)}/${k.chapter}`);
      return res.ok ? ((await res.json()) as Overview) : null;
    },
  );
  const [geography] = createResource(
    () => (perekPill() === 'geography' ? chapterKey() : undefined),
    async (k) => {
      const res = await fetch(`/api/geography/${encodeURIComponent(k.book)}/${k.chapter}`);
      return res.ok ? ((await res.json()) as PerekGeography) : null;
    },
  );
  const [tidbit] = createResource(
    () => (perekPill() === 'tidbit' ? chapterKey() : undefined),
    async (k) => {
      const res = await fetch(`/api/tidbit/${encodeURIComponent(k.book)}/${k.chapter}`);
      return res.ok ? ((await res.json()) as PerekTidbit) : null;
    },
  );
  // Only the tidbit for the chapter on screen (createResource retains the prior
  // value across a refetch — same guard as overview/geography).
  const currentTidbit = createMemo(() => {
    if (tidbit.loading) return null;
    const t = tidbit();
    return t && t.book === loc().book && t.chapter === loc().chapter ? t : null;
  });
  // Only the geography for the chapter on screen (createResource retains the
  // previous chapter's value across a refetch — same guard as the overview).
  const currentGeography = createMemo(() => {
    if (geography.loading) return null;
    const g = geography();
    return g && g.book === loc().book && g.chapter === loc().chapter ? g : null;
  });
  // Clicking a Geography place pin highlights the verse(s) it's named in (and
  // scrolls to the first), the way clicking a place works on the Talmud daf.
  const [placeVerses, setPlaceVerses] = createSignal<number[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = createSignal<string | undefined>();
  const highlightPlace = (verses: number[]) => {
    setPlaceVerses(verses);
    const first = verses.slice().sort((a, b) => a - b)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      scrollBand
        ?.querySelector(`.vtext[data-vn="${first}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };
  const clearPlace = () => {
    setPlaceVerses([]);
    setSelectedPlaceId(undefined);
  };
  // Clear the place highlight when the geography pill closes or the chapter changes.
  createEffect(() => {
    chapterKey();
    clearPlace();
  });
  createEffect(() => {
    if (perekPill() !== 'geography') clearPlace();
  });
  // createResource keeps the PREVIOUS chapter's value during a refetch, so the
  // drawer must not render it: only show the overview once it has loaded AND
  // its echoed book/chapter match the chapter on screen (else show loading).
  const currentOverview = createMemo(() => {
    if (overview.loading) return null;
    const o = overview();
    return o && o.book === loc().book && o.chapter === loc().chapter ? o : null;
  });
  // Opening a verse-source drawer closes any open pill / inspector (one panel).
  createEffect(() => {
    if (source()) {
      setPerekPill(null);
      setInspectOpen(false);
    }
  });
  createEffect(() => {
    chapterKey();
    setPerekPill(null);
    setInspectOpen(false);
  });

  // ---- Chapter load bar feed ----
  // Reset first (this effect is created before the reporters, so on a chapter
  // change it runs first and clears the previous chapter's entries); then each
  // piece reports its state. The always-on chapter pieces key by a stable id so
  // they overwrite across chapters; the overview reports only while its pill is
  // open (its resource keeps a stale value across chapters otherwise).
  createEffect(() => {
    chapterKey();
    resetChapterLoad();
  });
  createEffect(() => {
    if (data.loading) reportLoad('text', 'Text', 'loading');
    else if (data.error) reportLoad('text', 'Text', 'error');
    else if (data()) reportLoad('text', 'Text', 'ok');
  });
  createEffect(() => {
    if (events.loading) reportLoad('events', 'Sections', 'loading');
    else if (events.error) reportLoad('events', 'Sections', 'error');
    else if (events()) reportLoad('events', 'Sections', 'ok');
  });
  createEffect(() => {
    if (sourcesIndex.loading) reportLoad('sources', 'Sources', 'loading');
    else if (sourcesIndex.error) reportLoad('sources', 'Sources', 'error');
    else if (sourcesIndex() !== undefined) reportLoad('sources', 'Sources', 'ok');
  });
  createEffect(() => {
    if (perekPill() !== 'overview') return;
    if (overview.loading) reportLoad('overview', 'Overview', 'loading');
    else if (overview.error) reportLoad('overview', 'Overview', 'error');
    else if (overview()) reportLoad('overview', 'Overview', 'ok');
  });

  return (
    <div
      class="app"
      classList={{
        'view-scroll': loc().view === 'scroll',
        'view-mikraot': loc().view === 'mikraot',
      }}
    >
      <header class="topbar">
        <span class="brand">Tanach</span>
        <select
          class="book-select"
          value={loc().book}
          onChange={(e) => goto(e.currentTarget.value, 1)}
        >
          <For each={SECTIONS}>
            {(section: Section) => (
              <optgroup label={section}>
                <For each={BOOKS.filter((b) => b.section === section)}>
                  {(b) => (
                    <option value={b.name}>
                      {b.name} · {b.he}
                    </option>
                  )}
                </For>
              </optgroup>
            )}
          </For>
        </select>

        <Show when={parsha()}>
          {(p) => (
            <button
              type="button"
              class="parsha-btn"
              onClick={() => goto(p().book, p().chapter)}
              title={`This week's parsha — ${p().name} (${p().ref})`}
            >
              {loc().lang === 'he' ? p().heName || p().name : p().name}
            </button>
          )}
        </Show>

        {/* Mikraot Gedolot view hidden for now — Default (scroll) only. */}

        <Show when={loc().view === 'scroll'}>
          <button
            type="button"
            class="nikud-toggle"
            onClick={() => update({ nikud: !loc().nikud })}
          >
            {loc().nikud ? 'נִקּוּד' : 'נקוד'}
          </button>
        </Show>

        <LangToggle lang={loc().lang} onChange={(lang) => update({ lang })} />

        <a class="usage-link" href="/usage" title="LLM usage">
          usage
        </a>
        <button
          type="button"
          class="usage-link inspect-link"
          classList={{ active: inspectOpen() }}
          onClick={toggleInspect}
          title="Inspect this chapter's cache + cost"
        >
          inspect
        </button>

        <div class="chapter-nav">
          <Button
            disabled={loc().chapter <= 1}
            onClick={() => goto(loc().book, loc().chapter - 1)}
            aria-label="Previous chapter"
          >
            ‹
          </Button>
          <span class="chapter-label">
            {loc().lang === 'he' ? hebrewNumeral(loc().chapter) : `ch. ${loc().chapter}`}
          </span>
          <Button onClick={() => goto(loc().book, loc().chapter + 1)} aria-label="Next chapter">
            ›
          </Button>
        </div>
      </header>

      <ChapterLoadProgress />
      <Show when={data.error}>
        <p class="status error">{(data.error as Error)?.message}</p>
      </Show>

      {/* Mikraot Gedolot — pasuk framed by Rashi + Onkelos (daf-renderer) */}
      <Show when={loc().view === 'mikraot'}>
        <MikraotGedolot
          book={loc().book}
          chapter={loc().chapter}
          lang={loc().lang}
          sections={events() ?? []}
          sources={sourcesIndex()?.verses ?? []}
          activeVerse={source()?.verse ?? null}
          onAnchor={(verse) => openSource(verse, 'rishonim')}
          onSource={openSource}
        />
      </Show>

      {/* Scroll — Sefer Torah columns with Masoretic parsha breaks */}
      <Show when={loc().view === 'scroll' && data()}>
        {(ch) => (
          <main class="scroll-main" ref={(el) => (scrollMain = el)}>
            <PillRow>
              <For each={PEREK_PILLS}>
                {(p) => (
                  <Pill active={perekPill() === p.id} onClick={() => openPill(p.id)}>
                    {p.label}
                  </Pill>
                )}
              </For>
            </PillRow>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: scripture prose surface; onMouseUp is text-selection word lookup and onClick is a pointer convenience delegated to verse-number spans inside innerHTML — a role would mis-announce running text */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: the click target (.vnum spans inside innerHTML) is not focusable; the same verse drawers are keyboard-reachable via the gutter <button>s (evt-margin / vgutter) */}
            <div
              class="scroll-band"
              dir="rtl"
              ref={(el) => {
                scrollBand = el;
                bandObserver?.disconnect();
                if (el) bandObserver?.observe(el);
              }}
              onMouseUp={onTextSelect}
              onClick={onTextClick}
            >
              <For each={paragraphs()}>{(p) => <p class="scroll-para" innerHTML={p} />}</For>
            </div>
            <For each={anchors()}>
              {(a) => (
                <button
                  type="button"
                  class="evt-margin"
                  classList={{
                    'evt-left': a.side === 'left',
                    'evt-right': a.side === 'right',
                    active: selected()?.start === Number(a.v),
                  }}
                  style={{ top: `${a.top}px`, left: `${a.left}px`, width: `${ANCHOR_W}px` }}
                  data-v={a.v}
                  title={`${a.label} (verse ${a.v})`}
                  onClick={() => openAnchor(a)}
                >
                  {a.label}
                </button>
              )}
            </For>
            <For each={verseIcons()}>
              {(ic) => (
                <div class="vgutter-stack" style={{ top: `${ic.top}px`, left: `${ic.left}px` }}>
                  <For each={ic.kinds}>
                    {(k) => (
                      <button
                        type="button"
                        class={`vgutter vgutter-${k}`}
                        classList={{ active: source()?.verse === ic.v && source()?.kind === k }}
                        style={{ width: `${ICON_SIZE}px`, height: `${ICON_SIZE}px` }}
                        title={`${k} · verse ${ic.v}`}
                        onClick={() => openSource(ic.v, k)}
                      >
                        {KIND_GLYPH[k]}
                      </button>
                    )}
                  </For>
                </div>
              )}
            </For>
            <Show when={selected()}>
              {(sel) => (
                <div
                  class="note-pop"
                  classList={{
                    'note-left': sel().side === 'left',
                    'note-right': sel().side === 'right',
                  }}
                  style={{ top: `${sel().top}px` }}
                >
                  <button
                    type="button"
                    class="note-close"
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                  <div class="note-pop-label">{sel().label}</div>
                  <Show when={note.loading}>
                    <p class="note-pop-body muted">Reading the section…</p>
                  </Show>
                  <Show when={note()}>
                    {(n) => (
                      <p class="note-pop-body" dir={loc().lang === 'he' ? 'rtl' : 'ltr'}>
                        {loc().lang === 'he' ? n().he || n().en : n().en || n().he}
                      </p>
                    )}
                  </Show>
                </div>
              )}
            </Show>
            <div class="scroll-caption">
              <span class="he">{ch().heRef}</span>
              <ChapterFoot ch={ch()} goto={goto} lang={loc().lang} />
            </div>
          </main>
        )}
      </Show>

      {/* Word/phrase translation gloss, pinned at the selection */}
      <Show when={wordSel()}>
        {(w) => (
          <div class="xlate-pop" style={{ left: `${w().x}px`, top: `${w().y + 8}px` }}>
            <span class="xlate-he" dir="rtl">
              {w().he}
            </span>
            <Show when={translation.loading}>
              <span class="xlate-en muted">…</span>
            </Show>
            <Show when={!translation.loading}>
              <span class="xlate-en">{translation() ?? '—'}</span>
            </Show>
          </div>
        )}
      </Show>

      {/* Inspector drawer (what's cached for this chapter + cost) */}
      <Show when={inspectOpen()}>
        <Inspector
          book={loc().book}
          chapter={loc().chapter}
          lang={loc().lang}
          onClose={() => setInspectOpen(false)}
        />
      </Show>

      {/* Perek-level pill drawer (Overview, …) — same fixed right panel as the
          verse-source drawer, mutually exclusive with it */}
      <Show when={perekPill()} keyed>
        {(pill) => (
          <Drawer
            dir={loc().lang === 'he' ? 'rtl' : 'ltr'}
            title={
              loc().lang === 'he'
                ? `${heBook(loc().book)} ${hebrewNumeral(loc().chapter)}`
                : `${loc().book} ${loc().chapter}`
            }
            label={PILL_KIND[pill]}
            onClose={() => setPerekPill(null)}
          >
            <Show when={pill === 'overview'}>
              <Show when={overview.loading}>
                <p class="comm-muted">Reading the chapter…</p>
              </Show>
              <Show when={currentOverview()}>
                {(o) => (
                  <section class="perek-overview">
                    <Show
                      when={
                        loc().lang === 'he'
                          ? o().titleHe || o().titleEn
                          : o().titleEn || o().titleHe
                      }
                    >
                      {(title) => <h3 class="perek-title">{title()}</h3>}
                    </Show>
                    <Prose en={o().en} he={o().he} lang={loc().lang} />
                  </section>
                )}
              </Show>
              {/* fetched but failed (overview() is null, not undefined) */}
              <Show when={!overview.loading && overview() === null}>
                <p class="comm-muted">Couldn't load the overview — try reopening.</p>
              </Show>
            </Show>
            <Show when={pill === 'geography'}>
              <Show when={geography.loading}>
                <p class="comm-muted">Mapping the chapter…</p>
              </Show>
              <Show when={currentGeography()}>
                {(g) => (
                  <Show
                    when={g().places.length}
                    fallback={<p class="comm-muted">No mapped places in this chapter.</p>}
                  >
                    <GeoMap
                      bbox={fitBbox(g().places)}
                      points={g().places.map((p) => ({
                        id: p.en,
                        name: p.en,
                        nameHe: p.he,
                        lat: p.lat,
                        lng: p.lng,
                      }))}
                      lang={loc().lang}
                      height={460}
                      expandable
                      selected={selectedPlaceId()}
                      onSelect={(pt) => {
                        const place = g().places.find((p) => p.en === pt.id);
                        if (!place) return;
                        setSelectedPlaceId(pt.id);
                        highlightPlace(place.verses);
                      }}
                    />
                  </Show>
                )}
              </Show>
              <Show when={!geography.loading && geography() === null}>
                <p class="comm-muted">Couldn't load the geography — try reopening.</p>
              </Show>
            </Show>
            <Show when={pill === 'tidbit'}>
              <Show when={tidbit.loading}>
                <p class="comm-muted">Finding the tidbit…</p>
              </Show>
              <Show when={currentTidbit()}>
                {(t) => (
                  <section class="perek-overview perek-tidbit">
                    <Show
                      when={
                        loc().lang === 'he'
                          ? t().titleHe || t().titleEn
                          : t().titleEn || t().titleHe
                      }
                    >
                      {(title) => <h3 class="perek-title">{title()}</h3>}
                    </Show>
                    <Prose en={t().en} he={t().he} lang={loc().lang} />
                    <Show when={t().flavor || t().readingConfidence}>
                      <p class="tidbit-meta">
                        <Show when={t().flavor}>
                          {(f) => <span class="tidbit-flavor">{f().replace('-', ' ')}</span>}
                        </Show>
                        <Show when={t().readingConfidence}>
                          {(rc) => <span class="tidbit-conf">reading: {rc()}</span>}
                        </Show>
                      </p>
                    </Show>
                  </section>
                )}
              </Show>
              <Show when={!tidbit.loading && tidbit() === null}>
                <p class="comm-muted">Couldn't load the tidbit — try reopening.</p>
              </Show>
            </Show>
          </Drawer>
        )}
      </Show>

      {/* Classic commentary drawer (click a verse number) */}
      <Show when={source()} keyed>
        {(s) => (
          <Drawer
            dir={loc().lang === 'he' ? 'rtl' : 'ltr'}
            title={
              loc().lang === 'he'
                ? `${heBook(loc().book)} ${hebrewNumeral(loc().chapter)}:${hebrewNumeral(s.verse)}`
                : `${loc().book} ${loc().chapter}:${s.verse}`
            }
            label={SECTION_TITLE[s.kind]}
            onClose={() => setSource(null)}
          >
            <Show when={s.kind === 'rishonim'}>
              <Show when={richSet().has(s.verse)}>
                <section class="comm-synth">
                  <h4 class="comm-synth-name">Synthesis</h4>
                  <Show when={synthesis.loading}>
                    <p class="comm-muted">Synthesizing the commentators…</p>
                  </Show>
                  <Show when={synthesis()}>
                    {(sy) => (
                      <p class="comm-synth-text" dir={loc().lang === 'he' ? 'rtl' : 'ltr'}>
                        {loc().lang === 'he' ? sy().he || sy().en : sy().en || sy().he}
                      </p>
                    )}
                  </Show>
                </section>
              </Show>
              <Show when={commentary.loading}>
                <p class="comm-muted">Loading commentary…</p>
              </Show>
              <Show when={commentary()}>
                {(d) => (
                  <For
                    each={d().commentaries}
                    fallback={<p class="comm-muted">No commentary on this verse.</p>}
                  >
                    {(cm) => {
                      // The rishonim themselves always show in the Hebrew /
                      // Aramaic original (the English is a weak translation);
                      // fall back to English only when no Hebrew is available.
                      const useEn = cm.he.length === 0;
                      return (
                        <section class="comm-entry">
                          <h4 class="comm-name">{loc().lang === 'he' ? cm.heName : cm.en}</h4>
                          <For each={useEn ? cm.enText : cm.he}>
                            {(seg) => (
                              <p class="comm-text" dir={useEn ? 'ltr' : 'rtl'} innerHTML={seg} />
                            )}
                          </For>
                        </section>
                      );
                    }}
                  </For>
                )}
              </Show>
            </Show>

            <Show when={s.kind === 'gemara'}>
              <Show when={gemara.loading}>
                <p class="comm-muted">Finding Talmud passages…</p>
              </Show>
              <Show when={gemara()}>
                {(g) => <PassageList passages={g().passages} empty="Not cited in the Talmud." />}
              </Show>
            </Show>

            <Show when={s.kind === 'midrash'}>
              <Show when={(idxByVerse().get(s.verse)?.midrash ?? 0) >= MIDRASH_MIN}>
                <section class="comm-synth">
                  <h4 class="comm-synth-name">Synthesis</h4>
                  <Show when={midrashSynth.loading}>
                    <p class="comm-muted">Synthesizing the midrashim…</p>
                  </Show>
                  <Show when={midrashSynth()}>
                    {(sy) => (
                      <p class="comm-synth-text" dir={loc().lang === 'he' ? 'rtl' : 'ltr'}>
                        {loc().lang === 'he' ? sy().he || sy().en : sy().en || sy().he}
                      </p>
                    )}
                  </Show>
                </section>
              </Show>
              <Show when={midrash.loading}>
                <p class="comm-muted">Loading midrash…</p>
              </Show>
              <Show when={midrash()}>
                {(md) => <PassageList passages={md().passages} empty="No midrash on this verse." />}
              </Show>
            </Show>
          </Drawer>
        )}
      </Show>
    </div>
  );
}

function PassageList(props: {
  passages: { ref: string; he: string; en: string }[];
  empty: string;
}): JSX.Element {
  return (
    <For each={props.passages} fallback={<p class="comm-muted">{props.empty}</p>}>
      {(p) => {
        // Source passages (Gemara / Midrash) always show the Hebrew / Aramaic
        // original; fall back to English only when Sefaria has no Hebrew text.
        const text = p.he || p.en;
        const ltr = !p.he && !!p.en;
        return (
          <div class="gem-entry">
            <a
              class="gem-ref"
              href={`https://www.sefaria.org/${p.ref.replace(/ /g, '.').replace(/:/g, '.')}`}
              target="_blank"
              rel="noopener"
            >
              {p.ref}
            </a>
            <Show when={text}>
              <p class="gem-text" dir={ltr ? 'ltr' : 'rtl'}>
                {text}…
              </p>
            </Show>
          </div>
        );
      }}
    </For>
  );
}

function ChapterFoot(props: {
  ch: Chapter;
  goto: (b: string, c: number) => void;
  lang: 'en' | 'he';
}): JSX.Element {
  const fmt = (book: string, chapter: number) =>
    props.lang === 'he' ? `${heBook(book)} ${hebrewNumeral(chapter)}` : `${book} ${chapter}`;
  const nav = (ref: string | null, dir: 'prev' | 'next') => (
    <Show when={ref} fallback={<span />}>
      {(r) => {
        const p = parseRef(r());
        if (!p) return <span />;
        const txt = fmt(p.book, p.chapter);
        return (
          <button type="button" onClick={() => props.goto(p.book, p.chapter)}>
            {dir === 'prev' ? `‹ ${txt}` : `${txt} ›`}
          </button>
        );
      }}
    </Show>
  );
  return (
    <nav class="chapter-foot">
      {nav(props.ch.prev, 'prev')}
      {nav(props.ch.next, 'next')}
    </nav>
  );
}
