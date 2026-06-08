import { createResource, createSignal, onCleanup, Show, type JSX } from 'solid-js';
import { DafRenderer } from '../lib/daf-render/index.ts';

interface MG {
  book: string;
  chapter: number;
  ref: string;
  heRef: string;
  main: string;
  rashi: string;
  targum: string;
  next: string | null;
  prev: string | null;
  error?: string;
}

async function fetchMG(loc: { book: string; chapter: number }): Promise<MG> {
  const res = await fetch(`/api/mikraot/${encodeURIComponent(loc.book)}/${loc.chapter}`);
  const data = (await res.json()) as MG;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

const FAM = 'Frank Ruhl Libre';

/** The Mikraot Gedolot framed view: the pasuk text (center) wrapped by Rashi
 *  (inner) and Targum Onkelos (outer), laid out by the shared daf-renderer's
 *  tzurat-hadaf engine — the same renderer the Talmud reader uses. */
/** A wide content width that uses most of the viewport (the Mikraot Gedolot
 *  page is a broad spread, unlike the Talmud's narrow "sacred" daf). */
function wideWidth(): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return Math.min(1500, Math.max(720, vw - 48));
}

export function MikraotGedolot(props: { book: string; chapter: number }): JSX.Element {
  const [data] = createResource(() => ({ book: props.book, chapter: props.chapter }), fetchMG);
  const [width, setWidth] = createSignal(wideWidth());
  const onResize = () => setWidth(wideWidth());
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  }

  return (
    <main class="mg-main">
      <Show when={data.loading}>
        <p class="status">Loading commentaries…</p>
      </Show>
      <Show when={data.error}>
        <p class="status error">{(data.error as Error)?.message}</p>
      </Show>
      <Show when={data()}>
        {(d) => (
          <>
            <div class="mg-host">
              <DafRenderer
                main={d().main}
                inner={d().rashi || ' '}
                outer={d().targum || ' '}
                options={{
                  contentWidth: width(),
                  mainWidth: 0.5,
                  fontFamily: { main: FAM, inner: FAM, outer: FAM },
                  fontSize: { main: 22, side: 16 },
                  lineHeight: { main: 32, side: 23 },
                }}
              />
            </div>
            <p class="mg-caption">
              <span class="he">{d().heRef}</span>
              <span class="apparatus">פנים · רש״י · אונקלוס</span>
            </p>
          </>
        )}
      </Show>
    </main>
  );
}
