import { For, type JSX } from 'solid-js';

/**
 * Credits for the external sources this project ingests. Data-driven so adding
 * a future source is a one-line edit. Reached at #about, linked from the
 * alignment workbench header.
 */
interface SourceCredit {
  name: string;
  url: string;
  role: string;
  note?: string;
}

const SOURCES: SourceCredit[] = [
  {
    name: 'Sefaria',
    url: 'https://www.sefaria.org',
    role: 'Talmud text, segmentation, translations, and commentary links',
    note: 'Open digital library of Jewish texts. Text used under their open/CC licensing.',
  },
  {
    name: 'HebrewBooks',
    url: 'https://www.hebrewbooks.org',
    role: 'Printed-Talmud page typography (Gemara / Rashi / Tosafot columns)',
    note: 'Used to render the daf in its traditional printed layout.',
  },
  {
    name: 'Kollel Iyun HaDaf (Dafyomi Advancement Forum)',
    url: 'https://www.dafyomi.co.il',
    role: 'Per-daf study material: Background, Insights, Halacha, Tosfos outlines, Review questions, Points outlines, charts, and Yerushalmi parallels',
    note: 'Headed by Rav Mordecai Kornfeld. Content © Kollel Iyun HaDaf, ingested as a study source with attribution and links back to the original pages. Not redistributed as a standalone copy.',
  },
];

export function AttributionsPage(): JSX.Element {
  return (
    <main class="page-shell" style={{ '--page-max': '760px', 'font-family': 'system-ui, -apple-system, sans-serif', color: '#222' }}>
      <header style={{ 'margin-bottom': '1.25rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.5rem' }}>Sources &amp; credits</h1>
        <a href="#daf" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>← back to daf</a>
      </header>

      <p style={{ color: '#444', 'line-height': 1.6, 'margin-bottom': '1.5rem' }}>
        This is a personal, non-commercial, open-source study project. It stands on the work of
        others — the sources below make the daf legible, searchable, and richly annotated. Each is
        used with attribution and links back to the original.
      </p>

      <For each={SOURCES}>
        {(s) => (
          <article style={{ border: '1px solid #eee', 'border-radius': '8px', padding: '1rem 1.1rem', 'margin-bottom': '1rem', background: '#fff' }}>
            <div style={{ display: 'flex', 'align-items': 'baseline', 'justify-content': 'space-between', gap: '1rem' }}>
              <h2 style={{ margin: 0, 'font-size': '1.05rem' }}>{s.name}</h2>
              <a href={s.url} target="_blank" rel="noopener" style={{ 'font-size': '0.82rem', color: '#8a2a2b', 'text-decoration': 'none' }}>
                {s.url.replace(/^https?:\/\//, '')} ↗
              </a>
            </div>
            <p style={{ margin: '0.4rem 0 0', 'font-size': '0.9rem', color: '#333' }}>{s.role}</p>
            <p style={{ margin: '0.35rem 0 0', 'font-size': '0.82rem', color: '#777', 'line-height': 1.5 }}>{s.note}</p>
          </article>
        )}
      </For>
    </main>
  );
}
