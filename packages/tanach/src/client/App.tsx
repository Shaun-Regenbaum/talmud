import { createResource, createSignal, For, Show, type JSX } from 'solid-js';
import { BOOKS, SECTIONS, type Section } from '../lib/books.ts';

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

/** Parse a Sefaria section ref ("Genesis 2", "I Samuel 3") into book + chapter.
 *  Book names contain spaces, so split on the TRAILING number. */
function parseRef(ref: string): { book: string; chapter: number } | null {
  const m = ref.match(/^(.*?)\s+(\d+)$/);
  if (!m) return null;
  return { book: m[1], chapter: Number(m[2]) };
}

function readUrl(): { book: string; chapter: number } {
  const p = new URLSearchParams(window.location.search);
  const book = p.get('book') ?? 'Genesis';
  const chapter = Number(p.get('chapter') ?? '1') || 1;
  return { book: BOOKS.some((b) => b.name === book) ? book : 'Genesis', chapter };
}

async function fetchChapter(loc: { book: string; chapter: number }): Promise<Chapter> {
  const res = await fetch(`/api/chapter/${encodeURIComponent(loc.book)}/${loc.chapter}`);
  const data = (await res.json()) as Chapter;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export function App(): JSX.Element {
  const initial = readUrl();
  const [loc, setLoc] = createSignal(initial);
  const [data] = createResource(loc, fetchChapter);

  const go = (book: string, chapter: number) => {
    const next = { book, chapter };
    const p = new URLSearchParams({ book, chapter: String(chapter) });
    window.history.pushState(null, '', `?${p.toString()}`);
    setLoc(next);
    window.scrollTo(0, 0);
  };

  window.addEventListener('popstate', () => setLoc(readUrl()));

  const heName = (name: string) => BOOKS.find((b) => b.name === name)?.he ?? name;

  return (
    <div class="app">
      <header class="topbar">
        <span class="brand">Tanach</span>
        <select
          class="book-select"
          value={loc().book}
          onChange={(e) => go(e.currentTarget.value, 1)}
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
        <div class="chapter-nav">
          <button
            disabled={loc().chapter <= 1}
            onClick={() => go(loc().book, loc().chapter - 1)}
          >
            ‹
          </button>
          <span class="chapter-label">ch. {loc().chapter}</span>
          <button onClick={() => go(loc().book, loc().chapter + 1)}>›</button>
        </div>
      </header>

      <main class="reader">
        <h1 class="chapter-head">
          <span class="he" dir="rtl">
            {heName(loc().book)} {loc().chapter}
          </span>
          <span class="en">
            {loc().book} {loc().chapter}
          </span>
        </h1>

        <Show when={data.loading}>
          <p class="status">Loading…</p>
        </Show>
        <Show when={data.error}>
          <p class="status error">{(data.error as Error)?.message}</p>
        </Show>

        <Show when={data()}>
          {(ch) => (
            <>
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
              <nav class="chapter-foot">
                <Show when={ch().prev} fallback={<span />}>
                  {(prev) => {
                    const p = parseRef(prev());
                    return p ? (
                      <button onClick={() => go(p.book, p.chapter)}>‹ {prev()}</button>
                    ) : (
                      <span />
                    );
                  }}
                </Show>
                <Show when={ch().next}>
                  {(next) => {
                    const p = parseRef(next());
                    return p ? (
                      <button onClick={() => go(p.book, p.chapter)}>{next()} ›</button>
                    ) : (
                      <span />
                    );
                  }}
                </Show>
              </nav>
            </>
          )}
        </Show>
      </main>
    </div>
  );
}
