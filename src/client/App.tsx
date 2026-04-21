import { createResource, Show } from 'solid-js';
import type { TalmudPageData } from '../lib/sefref';

async function fetchDaf(ref: { tractate: string; page: string }): Promise<TalmudPageData> {
  const res = await fetch(`/api/daf/${ref.tractate}/${ref.page}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function App() {
  const [daf] = createResource({ tractate: 'Berakhot', page: '2a' }, fetchDaf);

  return (
    <main>
      <header>
        <h1>Talmud</h1>
        <p class="ref">Berakhot 2a</p>
      </header>

      <Show when={daf()} fallback={<p class="loading">Loading…</p>}>
        {(data) => (
          <article>
            <section class="main-text">
              <h2>Main</h2>
              <div dir="rtl" lang="he" class="hebrew">{data().mainText.hebrew}</div>
              <div class="english">{data().mainText.english}</div>
            </section>

            <Show when={data().rashi}>
              {(rashi) => (
                <section class="rashi">
                  <h2>Rashi</h2>
                  <div dir="rtl" lang="he" class="hebrew rashi-script">{rashi().hebrew}</div>
                </section>
              )}
            </Show>

            <Show when={data().tosafot}>
              {(tosafot) => (
                <section class="tosafot">
                  <h2>Tosafot</h2>
                  <div dir="rtl" lang="he" class="hebrew rashi-script">{tosafot().hebrew}</div>
                </section>
              )}
            </Show>
          </article>
        )}
      </Show>
    </main>
  );
}
