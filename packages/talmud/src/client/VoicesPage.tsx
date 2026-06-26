/**
 * #voices — the per-daf VOICE graph page. Stitches every section's
 * `argument.voices` into one daf-wide rabbi network (who disputes / responds to
 * / cites whom across the whole daf), then lists the per-section detail beneath
 * it as the audit view.
 *
 * Read-only and client-only: the data already rides along in the single
 * `/api/daf-view` fetch — each `argument.synthesis` piece carries its section's
 * `argument.voices` in `deps_resolved` (voices is a synthesis dependency), and
 * the `rabbi` mark supplies generations for node colouring. Nothing is
 * generated here; a cold section simply isn't shown (the banner says how many
 * are still warming). This per-daf graph is the unit the eventual Talmud-wide
 * rabbi network aggregates.
 */
import { createMemo, createResource, createSignal, For, type JSX, Show } from 'solid-js';
import { dafRefHe } from '../lib/sefref';
import {
  buildDafVoiceGraph,
  type DafVoiceGraph as DafVoiceGraphData,
  type SectionVoicesInput,
  type VoiceClass,
} from '../lib/typing/dafVoices';
import type { ArgumentVoicesData } from '../lib/typing/voices';
import DafVoiceGraph from './DafVoiceGraph';
import { type DafViewPiece, loadDafView } from './dafViewStore';
import { colorForGeneration } from './generations';
import { lang, t } from './i18n';
import { resolveVoiceGroup } from './voiceGroups';

interface DafRef {
  tractate: string;
  page: string;
}

function readRef(): DafRef {
  const p = new URLSearchParams(window.location.search);
  return { tractate: p.get('tractate') ?? 'Berakhot', page: p.get('page') ?? '2a' };
}

interface BuiltView {
  graph: DafVoiceGraphData;
  /** Total argument sections on the daf (warm or not). */
  totalSections: number;
  /** Sections that had voices data (made it into the graph). */
  analyzedSections: number;
  complete: boolean;
}

type RabbiMarkParsed = {
  instances?: Array<{ fields?: { name?: string; nameHe?: string; generation?: string } }>;
};
type ArgumentMarkParsed = {
  instances?: Array<{ startSegIdx?: number; fields?: { title?: string } }>;
};

function buildFromPieces(pieces: Record<string, DafViewPiece>, complete: boolean): BuiltView {
  // Rabbi generations: name -> generation id, for node colouring.
  const genByName = new Map<string, string>();
  const rabbiParsed = pieces.rabbi?.parsed as RabbiMarkParsed | undefined;
  for (const inst of rabbiParsed?.instances ?? []) {
    const nm = inst.fields?.name?.trim();
    if (nm && inst.fields?.generation && !genByName.has(nm)) {
      genByName.set(nm, inst.fields.generation);
    }
  }

  // Section daf-order: title -> first startSegIdx from the argument mark.
  const orderByTitle = new Map<string, number>();
  const argParsed = pieces.argument?.parsed as ArgumentMarkParsed | undefined;
  (argParsed?.instances ?? []).forEach((inst, i) => {
    const ti = inst.fields?.title?.trim();
    if (ti && !orderByTitle.has(ti)) {
      orderByTitle.set(ti, typeof inst.startSegIdx === 'number' ? inst.startSegIdx : i);
    }
  });
  const totalSections = orderByTitle.size;

  // One section per argument.synthesis piece; its voices ride in deps_resolved.
  const sections: SectionVoicesInput[] = [];
  for (const piece of Object.values(pieces)) {
    if (piece.producerId !== 'argument.synthesis') continue;
    const voices = piece.deps_resolved?.['argument.voices'] as ArgumentVoicesData | undefined;
    sections.push({ title: piece.instanceLabel ?? piece.instanceId ?? '', voices: voices ?? null });
  }
  sections.sort(
    (a, b) =>
      (orderByTitle.get(a.title) ?? Number.MAX_SAFE_INTEGER) -
      (orderByTitle.get(b.title) ?? Number.MAX_SAFE_INTEGER),
  );

  const classify = (name: string): VoiceClass => ({
    collective: !!resolveVoiceGroup(name),
    generation: genByName.get(name),
  });

  const graph = buildDafVoiceGraph(sections, classify);
  return {
    graph,
    totalSections: Math.max(totalSections, graph.sections.length),
    analyzedSections: graph.sections.length,
    complete,
  };
}

export function VoicesPage(): JSX.Element {
  const [ref, setRef] = createSignal<DafRef>(readRef());
  const sync = () => setRef(readRef());
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);

  const [payload] = createResource(
    () => `${ref().tractate}:${ref().page}:${lang()}`,
    async () => {
      const r = ref();
      return loadDafView(r.tractate, r.page, lang());
    },
  );

  const built = createMemo<BuiltView | null>(() => {
    const p = payload();
    if (!p) return null;
    return buildFromPieces(p.pieces ?? {}, !!p.complete);
  });

  const title = () =>
    lang() === 'he' ? dafRefHe(ref().tractate, ref().page) : `${ref().tractate} ${ref().page}`;
  const backHref = () =>
    `?tractate=${encodeURIComponent(ref().tractate)}&page=${encodeURIComponent(ref().page)}#daf`;

  // Look up a node's generation colour / collective-ness for the breakdown chips.
  const nodeByName = createMemo(() => {
    const m = new Map<string, DafVoiceGraphData['nodes'][number]>();
    for (const n of built()?.graph.nodes ?? []) m.set(n.name, n);
    return m;
  });

  return (
    <main class="page-shell" style={{ '--page-max': '880px', color: '#222' }}>
      <header style={{ 'margin-bottom': '1.1rem' }}>
        <a
          href={backHref()}
          style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}
        >
          ← {t('voices.page.back')}
        </a>
        <h1 style={{ margin: '0.4rem 0 0', 'font-size': '1.45rem' }}>
          {t('voices.page.title')} · <span style={{ color: '#8a2a2b' }}>{title()}</span>
        </h1>
        <p
          style={{ margin: '0.3rem 0 0', color: '#666', 'font-size': '0.9rem', 'line-height': 1.5 }}
        >
          {t('voices.page.subtitle')}
        </p>
      </header>

      <Show
        when={!payload.loading}
        fallback={<p style={{ color: '#888' }}>{t('voices.page.loading')}</p>}
      >
        <Show
          when={built() && built()!.graph.nodes.length > 0}
          fallback={
            <div
              style={{
                border: '1px solid #ece7db',
                'border-radius': '8px',
                background: '#faf8f3',
                padding: '1rem 1.1rem',
                color: '#6b6661',
                'line-height': 1.55,
              }}
            >
              <p style={{ margin: 0 }}>{t('voices.page.empty')}</p>
              <a
                href={backHref()}
                style={{ color: '#8a2a2b', 'font-size': '0.85rem', 'text-decoration': 'none' }}
              >
                {t('voices.page.openDaf')} →
              </a>
            </div>
          }
        >
          {/* Partial-warming banner: some sections aren't analyzed yet. */}
          <Show when={built()!.analyzedSections < built()!.totalSections}>
            <div
              style={{
                border: '1px solid #e7ddc6',
                'border-radius': '8px',
                background: '#fbf6e9',
                padding: '0.55rem 0.85rem',
                color: '#8a6d3b',
                'font-size': '0.82rem',
                'margin-bottom': '0.9rem',
              }}
            >
              {t('voices.page.partial')
                .replace('{done}', String(built()!.analyzedSections))
                .replace('{total}', String(built()!.totalSections))}
            </div>
          </Show>

          <DafVoiceGraph nodes={built()!.graph.nodes} edges={built()!.graph.edges} />

          {/* Per-section breakdown — the audit view: each section's voices + relations. */}
          <section style={{ 'margin-top': '1.6rem' }}>
            <h2 style={{ 'font-size': '0.95rem', color: '#444', margin: '0 0 0.6rem' }}>
              {t('voices.page.bySection')}
            </h2>
            <For each={built()!.graph.sections}>
              {(sec, idx) => (
                <article
                  style={{
                    border: '1px solid #ece7db',
                    'border-radius': '8px',
                    background: '#fff',
                    padding: '0.7rem 0.9rem',
                    'margin-bottom': '0.7rem',
                  }}
                >
                  <h3 style={{ margin: '0 0 0.5rem', 'font-size': '0.9rem', color: '#2a2520' }}>
                    <span style={{ color: '#b8b2a4' }}>{idx() + 1}.</span> {sec.title}
                  </h3>
                  <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.3rem 0.4rem' }}>
                    <For each={sec.voices.voices}>
                      {(v) => {
                        const node = () => nodeByName().get(v.name);
                        const color = () =>
                          node()?.collective ? '#b8b2a4' : colorForGeneration(node()?.generation);
                        return (
                          <span
                            style={{
                              display: 'inline-flex',
                              'align-items': 'center',
                              gap: '0.3rem',
                              padding: '0.1rem 0.5rem',
                              'border-radius': '999px',
                              border: '1px solid #eee',
                              background: '#fafafa',
                              'font-size': '0.78rem',
                              color: '#333',
                            }}
                          >
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                'border-radius': '999px',
                                background: color(),
                                display: 'inline-block',
                              }}
                            />
                            {lang() === 'he' && v.nameHe ? v.nameHe : v.name}
                          </span>
                        );
                      }}
                    </For>
                  </div>
                  <Show when={sec.voices.edges.length > 0}>
                    <ul
                      style={{
                        margin: '0.55rem 0 0',
                        padding: '0 0 0 0',
                        'list-style': 'none',
                        'font-size': '0.8rem',
                        color: '#555',
                        'line-height': 1.7,
                      }}
                    >
                      <For each={sec.voices.edges}>
                        {(e) => (
                          <li>
                            <strong style={{ 'font-weight': 600, color: '#2a2520' }}>
                              {e.from}
                            </strong>{' '}
                            <span style={{ color: '#8a6d3b' }}>{t(`dafvoices.rel.${e.kind}`)}</span>{' '}
                            <strong style={{ 'font-weight': 600, color: '#2a2520' }}>{e.to}</strong>
                            <Show when={e.note}>
                              <span style={{ color: '#999' }}> — {e.note}</span>
                            </Show>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </article>
              )}
            </For>
          </section>
        </Show>
      </Show>
    </main>
  );
}
