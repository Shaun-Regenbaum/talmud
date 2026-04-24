/**
 * Enrichment strategy comparison page.
 *
 * Interactive UI for picking a tractate+daf, loading its cached skeleton,
 * running several Stage-B enrichment strategies side-by-side, and diffing
 * the outputs against the cached ground-truth (analyze:v5:*) when one
 * exists. Used to pick a winner before the full Shas enrichment pass.
 */
import { createResource, createSignal, For, Show, type JSX } from 'solid-js';
import { TRACTATE_OPTIONS } from '../lib/sefref';

// ---- types ----------------------------------------------------------------

interface SkeletonSection {
  title: string;
  summary: string;
  excerpt: string;
  rabbiNames: string[];
}
interface Skeleton {
  summary: string;
  sections: SkeletonSection[];
  _cached?: boolean;
}

interface BiblicalRef {
  ref: string;
  hebrewRef?: string;
  hebrewQuote?: string;
}
interface DifficultyRating { score: 1 | 2 | 3 | 4 | 5; reason: string; }
interface Rabbi {
  name: string;
  nameHe: string;
  period: string;
  location: string;
  role: string;
  opinionStart?: string;
  opinionEnd?: string;
  aliases?: string[];
  generation?: string;
  agreesWith?: string[];
  disagreesWith?: string[];
}
interface AnalysisSection {
  title: string;
  summary: string;
  excerpt?: string;
  references?: BiblicalRef[];
  parallels?: string[];
  difficulty?: DifficultyRating;
  rabbis: Rabbi[];
}
interface Analysis {
  summary: string;
  difficulty?: DifficultyRating;
  sections: AnalysisSection[];
}

interface StrategyCallDiag {
  prompt_chars: number;
  content_chars: number;
  reasoning_chars: number;
  elapsed_ms: number;
  finish_reason: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}
interface StrategyResult extends Analysis {
  _strategy: string;
  _elapsed_ms: number;
  _calls: StrategyCallDiag[];
  _warnings: string[];
  _metadata: Record<string, unknown>;
  _skeletonSummary?: string;
}

type StrategyName = 'baseline' | 'per-section' | 'hybrid' | 'rich-rabbi' | 'references' | 'parallels' | 'difficulty';
const STRATEGIES: ReadonlyArray<{ id: StrategyName; label: string; group: 'base' | 'overlay'; desc: string }> = [
  { id: 'baseline',    label: 'Baseline',    group: 'base',    desc: 'Monolithic Kimi K2.5 call with full context. Reference — matches analyze:v5 cache.' },
  { id: 'per-section', label: 'Per-section', group: 'base',    desc: 'One K2.5 call per section with just that section\'s skeleton + focal. Concurrency 3.' },
  { id: 'hybrid',      label: 'Hybrid',      group: 'base',    desc: 'Rabbi-places.json lookup (nameHe/period/location/generation/aliases) + single K2.5 for role + opinionStart.' },
  { id: 'rich-rabbi',  label: 'Rich rabbi',  group: 'base',    desc: 'Hybrid + agreesWith/disagreesWith + opinionEnd (full statement span). One LLM call.' },
  { id: 'references',  label: 'References',  group: 'overlay', desc: 'Biblical verses (pesukim) quoted per section. Shown as badges under each section.' },
  { id: 'parallels',   label: 'Parallels',   group: 'overlay', desc: 'Parallel sugyot in other masechtot per section. Uses Rishonim commentary heavily.' },
  { id: 'difficulty',  label: 'Difficulty',  group: 'overlay', desc: '1-5 educational difficulty per section + overall daf, with one-sentence rationale.' },
];

// ---- fetchers -------------------------------------------------------------

async function fetchSkeleton(tractate: string, page: string): Promise<Skeleton> {
  const res = await fetch(`/api/analyze/${encodeURIComponent(tractate)}/${page}?skeleton_only=1`);
  if (!res.ok) throw new Error(`skeleton fetch: HTTP ${res.status}`);
  return res.json();
}

async function fetchGroundTruth(tractate: string, page: string): Promise<Analysis | null> {
  const res = await fetch(`/api/enrich/ground-truth/${encodeURIComponent(tractate)}/${page}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ground-truth: HTTP ${res.status}`);
  return res.json();
}

async function runStrategy(tractate: string, page: string, strategy: StrategyName): Promise<StrategyResult> {
  const res = await fetch(
    `/api/enrich/${encodeURIComponent(tractate)}/${page}?strategy=${strategy}`,
    { method: 'POST' },
  );
  const body = await res.json().catch(() => null) as (StrategyResult & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  if (!body) throw new Error('empty response');
  return body;
}

// ---- diff -----------------------------------------------------------------

type DiffStatus = 'unchanged' | 'added' | 'removed' | 'changed';
interface FieldDiff { field: keyof Rabbi; status: DiffStatus; a?: string; b?: string; }
interface RabbiDiff { key: string; status: DiffStatus; fields: FieldDiff[]; left?: Rabbi; right?: Rabbi; }
interface SectionDiff { title: string; status: DiffStatus; rabbis: RabbiDiff[]; }

function rabbiKey(r: Rabbi): string {
  return `${(r.name || '').trim().toLowerCase()}|${(r.nameHe || '').trim()}`;
}

function diffAnalyses(ground: Analysis, strat: StrategyResult): SectionDiff[] {
  const secsByTitle = new Map<string, AnalysisSection>();
  for (const s of ground.sections) secsByTitle.set(s.title.toLowerCase(), s);

  const sectionDiffs: SectionDiff[] = [];
  const seenSecs = new Set<string>();

  for (const stratSec of strat.sections) {
    const key = stratSec.title.toLowerCase();
    const groundSec = secsByTitle.get(key);
    seenSecs.add(key);
    if (!groundSec) {
      sectionDiffs.push({ title: stratSec.title, status: 'added', rabbis: stratSec.rabbis.map(r => ({ key: rabbiKey(r), status: 'added', fields: [], right: r })) });
      continue;
    }
    const rabbiDiffs = diffRabbis(groundSec.rabbis, stratSec.rabbis);
    const anyChange = rabbiDiffs.some(r => r.status !== 'unchanged');
    sectionDiffs.push({ title: stratSec.title, status: anyChange ? 'changed' : 'unchanged', rabbis: rabbiDiffs });
  }
  for (const [key, groundSec] of secsByTitle.entries()) {
    if (!seenSecs.has(key)) {
      sectionDiffs.push({ title: groundSec.title, status: 'removed', rabbis: groundSec.rabbis.map(r => ({ key: rabbiKey(r), status: 'removed', fields: [], left: r })) });
    }
  }
  return sectionDiffs;
}

function diffRabbis(leftList: Rabbi[], rightList: Rabbi[]): RabbiDiff[] {
  const leftByKey = new Map<string, Rabbi>();
  for (const r of leftList) leftByKey.set(rabbiKey(r), r);
  const diffs: RabbiDiff[] = [];
  const seen = new Set<string>();

  for (const r of rightList) {
    const k = rabbiKey(r);
    seen.add(k);
    const match = leftByKey.get(k);
    if (!match) { diffs.push({ key: k, status: 'added', fields: [], right: r }); continue; }
    const fields: FieldDiff[] = [];
    for (const field of ['nameHe', 'period', 'location', 'role', 'opinionStart'] as (keyof Rabbi)[]) {
      const a = (match[field] ?? '') as string;
      const b = (r[field] ?? '') as string;
      if (a !== b) fields.push({ field, status: 'changed', a, b });
    }
    diffs.push({ key: k, status: fields.length > 0 ? 'changed' : 'unchanged', fields, left: match, right: r });
  }
  for (const [k, r] of leftByKey.entries()) {
    if (!seen.has(k)) diffs.push({ key: k, status: 'removed', fields: [], left: r });
  }
  return diffs;
}

// ---- merge multiple strategy results into one enriched analysis -----------
// Each strategy produces a DafAnalysis shape but populates different fields:
//   rich-rabbi  → rabbis with nameHe/period/location/role/opinionStart/
//                  opinionEnd/agreesWith/disagreesWith/generation
//   per-section → alternative rabbi shaping (for comparison)
//   references  → section.references[]
//   parallels   → section.parallels[]
//   difficulty  → section.difficulty + analysis.difficulty
// Merge policy: prefer rich-rabbi's rabbi data (it's the most complete);
// overlay references/parallels/difficulty by matching section titles.
function mergeStrategies(by: Partial<Record<StrategyName, StrategyResult>>): Analysis | null {
  const base = by['rich-rabbi'] ?? by['per-section'] ?? by['hybrid'] ?? by['baseline'];
  if (!base) return null;

  const sectionByTitle = new Map<string, AnalysisSection>();
  for (const sec of base.sections) {
    sectionByTitle.set(sec.title.toLowerCase(), { ...sec });
  }

  const refs = by['references'];
  if (refs) {
    for (const sec of refs.sections) {
      const key = sec.title.toLowerCase();
      const existing = sectionByTitle.get(key);
      if (existing && sec.references) existing.references = sec.references;
    }
  }
  const par = by['parallels'];
  if (par) {
    for (const sec of par.sections) {
      const key = sec.title.toLowerCase();
      const existing = sectionByTitle.get(key);
      if (existing && sec.parallels) existing.parallels = sec.parallels;
    }
  }
  const diff = by['difficulty'];
  if (diff) {
    for (const sec of diff.sections) {
      const key = sec.title.toLowerCase();
      const existing = sectionByTitle.get(key);
      if (existing && sec.difficulty) existing.difficulty = sec.difficulty;
    }
  }

  const orderedSections = base.sections.map(s => sectionByTitle.get(s.title.toLowerCase())!).filter(Boolean);

  return {
    summary: base.summary,
    difficulty: diff?.difficulty,
    sections: orderedSections,
  };
}

// ---- argument-flow sidebar render -----------------------------------------
// Minimal 340px-wide layout.
//   - Daf summary (prose)
//   - For each argument section:
//     - Section header (title)
//     - Section summary (prose)
//     - Stack of rabbi cards (one per voice): name / era / role
//     - Single "…" toggle at bottom of section that reveals:
//         • +/− support-dispute edges between the rabbis in this section
//         • pesukim quoted in this section
//         • parallel sugyot for this section
//         • difficulty of this section

function ArgumentFlowSidebar(props: {
  tractate: string;
  page: string;
  analysis: Analysis;
  partialNote: string | null;
}): JSX.Element {
  const a = () => props.analysis;
  return (
    <aside class="flow-sidebar">
      <header class="flow-header">
        <span class="flow-tractate">{props.tractate}</span>
        <span class="flow-page">{props.page}</span>
        <Show when={props.partialNote}>
          <span class="flow-partial">{props.partialNote}</span>
        </Show>
      </header>

      <Show when={a().summary}>
        <p class="flow-daf-summary">{a().summary}</p>
      </Show>

      <For each={a().sections}>{(sec, idx) => <ArgumentSection sec={sec} idx={idx()} />}</For>
    </aside>
  );
}

function ArgumentSection(props: { sec: AnalysisSection; idx: number }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const sec = () => props.sec;
  const supportEdges = () => (sec().rabbis || [])
    .flatMap(r => (r.agreesWith ?? []).map(target => ({ from: r.name, to: target })));
  const disputeEdges = () => (sec().rabbis || [])
    .flatMap(r => (r.disagreesWith ?? []).map(target => ({ from: r.name, to: target })));
  const hasDetail = () => !!(
    supportEdges().length > 0
    || disputeEdges().length > 0
    || (sec().references && sec().references!.length > 0)
    || (sec().parallels && sec().parallels!.length > 0)
    || sec().difficulty
  );

  return (
    <section class="flow-section">
      <h3 class="flow-section-head">
        <span class="flow-section-num">§{props.idx + 1}</span>
        <span class="flow-section-title">{sec().title}</span>
      </h3>
      <Show when={sec().summary}>
        <p class="flow-section-summary">{sec().summary}</p>
      </Show>

      <Show when={sec().rabbis && sec().rabbis.length > 0}>
        <div class="flow-rabbis">
          <For each={sec().rabbis}>{(r) => <RabbiCard rabbi={r} />}</For>
        </div>
      </Show>

      <Show when={hasDetail()}>
        <div class="flow-section-more">
          <button
            class="flow-more-btn"
            onClick={() => setOpen(!open())}
            aria-expanded={open()}
          >{open() ? '−' : '…'}</button>
        </div>

        <Show when={open()}>
          <div class="flow-detail">
            <Show when={supportEdges().length > 0 || disputeEdges().length > 0}>
              <div class="flow-d-row">
                <span class="flow-d-label">Positions</span>
                <div class="flow-d-body">
                  <For each={supportEdges()}>{(e) => (
                    <div class="flow-d-edge">
                      <span class="flow-d-plus">+</span> {e.from} <span class="flow-d-prep">with</span> {e.to}
                    </div>
                  )}</For>
                  <For each={disputeEdges()}>{(e) => (
                    <div class="flow-d-edge">
                      <span class="flow-d-minus">−</span> {e.from} <span class="flow-d-prep">vs</span> {e.to}
                    </div>
                  )}</For>
                </div>
              </div>
            </Show>

            <Show when={sec().references && sec().references!.length > 0}>
              <div class="flow-d-row">
                <span class="flow-d-label">Pesukim</span>
                <div class="flow-d-body flow-d-wrap">
                  <For each={sec().references!}>{(ref) => (
                    <span class="flow-d-ref" title={ref.hebrewQuote || ref.ref}>
                      {ref.hebrewRef || ref.ref}
                    </span>
                  )}</For>
                </div>
              </div>
            </Show>

            <Show when={sec().parallels && sec().parallels!.length > 0}>
              <div class="flow-d-row">
                <span class="flow-d-label">See also</span>
                <div class="flow-d-body flow-d-wrap">
                  <For each={sec().parallels!}>{(p) => <span class="flow-d-parallel">{p}</span>}</For>
                </div>
              </div>
            </Show>

            <Show when={sec().difficulty}>
              <div class="flow-d-row">
                <span class="flow-d-label">Difficulty</span>
                <div class="flow-d-body">
                  <span class="flow-d-stars">{'★'.repeat(sec().difficulty!.score)}{'☆'.repeat(5 - sec().difficulty!.score)}</span>
                  <span class="flow-d-diff-reason"> {sec().difficulty!.reason}</span>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </section>
  );
}

function RabbiCard(props: { rabbi: Rabbi }): JSX.Element {
  const r = () => props.rabbi;
  return (
    <div class="flow-rabbi">
      <div class="flow-rabbi-name">
        {r().name}
        <Show when={r().nameHe}><span class="flow-rabbi-he"> · {r().nameHe}</span></Show>
        <Show when={r().period}>
          <span class="flow-rabbi-era">{r().period.replace(/,.*$/, '')}</span>
        </Show>
      </div>
      <Show when={r().role}>
        <div class="flow-rabbi-role">{r().role}</div>
      </Show>
    </div>
  );
}

// ---- preview sub-component ------------------------------------------------

function difficultyColor(score: number): string {
  // Green → yellow → red gradient
  if (score <= 1) return '#10b981';
  if (score === 2) return '#84cc16';
  if (score === 3) return '#eab308';
  if (score === 4) return '#f97316';
  return '#ef4444';
}

function SectionPreview(props: { sec: AnalysisSection }): JSX.Element {
  const sec = () => props.sec;
  return (
    <div class="preview-section">
      <div class="preview-section-header">
        <span class="preview-title">§ {sec().title}</span>
        <Show when={sec().difficulty}>
          <span
            class="preview-diff-dot"
            title={sec().difficulty?.reason}
            style={{ background: difficultyColor(sec().difficulty!.score) }}
          >
            ★{sec().difficulty!.score}
          </span>
        </Show>
      </div>
      <Show when={sec().excerpt}>
        <div class="preview-excerpt">{sec().excerpt}</div>
      </Show>
      <Show when={sec().rabbis && sec().rabbis.length > 0}>
        <div class="preview-rabbis">
          <For each={sec().rabbis}>{(r) => (
            <div class="preview-rabbi">
              <span class="preview-rabbi-name">
                {r.name}{r.nameHe ? ` (${r.nameHe})` : ''}
                <Show when={r.generation}>
                  <span class="preview-generation">[{r.generation}]</span>
                </Show>
              </span>
              <Show when={r.role}>
                <div class="preview-role">{r.role}</div>
              </Show>
              <Show when={r.opinionStart || r.opinionEnd}>
                <div class="preview-opinion">
                  <Show when={r.opinionStart}>
                    <span class="preview-opinion-start">{r.opinionStart}</span>
                  </Show>
                  <Show when={r.opinionStart && r.opinionEnd}>
                    <span class="preview-opinion-ellipsis"> … </span>
                  </Show>
                  <Show when={r.opinionEnd}>
                    <span class="preview-opinion-end">{r.opinionEnd}</span>
                  </Show>
                </div>
              </Show>
              <Show when={r.agreesWith && r.agreesWith.length > 0}>
                <div class="preview-rel-row">
                  <span class="preview-rel-label preview-rel-agrees">Agrees with</span>
                  <span class="preview-rel-names">{r.agreesWith!.join(', ')}</span>
                </div>
              </Show>
              <Show when={r.disagreesWith && r.disagreesWith.length > 0}>
                <div class="preview-rel-row">
                  <span class="preview-rel-label preview-rel-disagrees">Disputes</span>
                  <span class="preview-rel-names">{r.disagreesWith!.join(', ')}</span>
                </div>
              </Show>
            </div>
          )}</For>
        </div>
      </Show>
      <Show when={sec().references && sec().references!.length > 0}>
        <div class="preview-refs">
          <span class="preview-label">Refs:</span>
          <For each={sec().references!}>{(ref) => (
            <span class="preview-ref-badge" title={ref.hebrewQuote}>
              {ref.hebrewRef || ref.ref}
            </span>
          )}</For>
        </div>
      </Show>
      <Show when={sec().parallels && sec().parallels!.length > 0}>
        <div class="preview-parallels">
          <span class="preview-label">↗</span>
          <For each={sec().parallels!}>{(p) => <span class="preview-parallel-chip">{p}</span>}</For>
        </div>
      </Show>
    </div>
  );
}

// ---- component ------------------------------------------------------------

export function EnrichmentPage(): JSX.Element {
  const [tractate, setTractate] = createSignal('Berakhot');
  const [page, setPage] = createSignal('5a');
  // Trigger for skeleton load — bump to force refetch
  const [loadKey, setLoadKey] = createSignal(0);

  // Strategy state (per strategy)
  const [results, setResults] = createSignal<Partial<Record<StrategyName, StrategyResult>>>({});
  const [running, setRunning] = createSignal<Partial<Record<StrategyName, boolean>>>({});
  const [errors, setErrors] = createSignal<Partial<Record<StrategyName, string>>>({});
  const [diffAgainst, setDiffAgainst] = createSignal<StrategyName | null>(null);

  const dafKey = () => `${tractate()}|${page()}|${loadKey()}`;

  const [skeleton] = createResource(dafKey, async () => {
    if (loadKey() === 0) return null;
    return fetchSkeleton(tractate(), page());
  });
  const [groundTruth] = createResource(dafKey, async () => {
    if (loadKey() === 0) return null;
    return fetchGroundTruth(tractate(), page()).catch(() => null);
  });

  const handleLoad = () => {
    setResults({});
    setRunning({});
    setErrors({});
    setDiffAgainst(null);
    setLoadKey(loadKey() + 1);
  };

  const handleRun = async (strategy: StrategyName) => {
    setRunning((r) => ({ ...r, [strategy]: true }));
    setErrors((e) => ({ ...e, [strategy]: undefined }));
    try {
      const result = await runStrategy(tractate(), page(), strategy);
      setResults((r) => ({ ...r, [strategy]: result }));
      if (!diffAgainst() && groundTruth()) setDiffAgainst(strategy);
    } catch (err) {
      setErrors((e) => ({ ...e, [strategy]: String(err) }));
    } finally {
      setRunning((r) => ({ ...r, [strategy]: false }));
    }
  };

  const handleRunAll = async () => {
    await Promise.all(STRATEGIES.map(s => handleRun(s.id)));
  };

  // The "Render merged view" flow: runs the 5 strategies the user cares about
  // (per-section + rich-rabbi + references + parallels + difficulty) in
  // parallel and renders the merged output. Re-uses any strategy already
  // executed (results() is a cache). Baseline/hybrid skipped — rich-rabbi
  // covers them with more fields.
  const MERGE_SET: StrategyName[] = ['per-section', 'rich-rabbi', 'references', 'parallels', 'difficulty'];
  const handleRenderMerged = async () => {
    await Promise.all(MERGE_SET.map(async (s) => {
      if (results()[s] || running()[s]) return;
      await handleRun(s);
    }));
  };
  const mergedView = () => mergeStrategies(results());
  const mergedReady = () => MERGE_SET.every(s => results()[s]);

  return (
    <div class="enrichment-page">
      <style>{`
        .enrichment-page { font-family: system-ui, -apple-system, sans-serif; max-width: 1400px; margin: 0 auto; padding: 1rem; }
        .enrichment-page h1 { margin: 0 0 0.5rem; }
        .enrichment-page .controls { display: flex; gap: 0.75rem; align-items: center; padding: 0.75rem; background: #f6f6f6; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 1rem; flex-wrap: wrap; }
        .enrichment-page .controls label { font-weight: 500; margin-right: 0.25rem; }
        .enrichment-page select, .enrichment-page input[type="text"] { padding: 0.35rem 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
        .enrichment-page button { padding: 0.35rem 0.75rem; border: 1px solid #333; background: white; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .enrichment-page button:hover:not(:disabled) { background: #eee; }
        .enrichment-page button:disabled { opacity: 0.4; cursor: not-allowed; }
        .enrichment-page button.primary { background: #2563eb; color: white; border-color: #1d4ed8; }
        .enrichment-page button.primary:hover:not(:disabled) { background: #1d4ed8; }
        .enrichment-page section.panel { margin-bottom: 1.5rem; padding: 0.75rem 1rem; background: white; border: 1px solid #ddd; border-radius: 6px; }
        .enrichment-page .skeleton-sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.5rem; margin-top: 0.5rem; }
        .enrichment-page .skel-section { padding: 0.5rem; background: #fafafa; border: 1px solid #eee; border-radius: 4px; }
        .enrichment-page .skel-section h4 { margin: 0 0 0.25rem; font-size: 13px; }
        .enrichment-page .skel-section .excerpt { font-family: Arial Hebrew, David, serif; direction: rtl; text-align: right; color: #555; font-size: 13px; }
        .enrichment-page .skel-section .rabbi-list { font-size: 12px; color: #666; margin-top: 0.25rem; }
        .enrichment-page .strategy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 0.75rem; }
        .enrichment-page .strategy-card { border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem; background: white; display: flex; flex-direction: column; gap: 0.5rem; }
        .enrichment-page .strategy-card h3 { margin: 0; font-size: 15px; }
        .enrichment-page .strategy-card .desc { font-size: 12px; color: #666; }
        .enrichment-page .strategy-card .metrics { font-family: ui-monospace, Menlo, monospace; font-size: 12px; background: #f6f6f6; padding: 0.4rem 0.5rem; border-radius: 4px; }
        .enrichment-page .strategy-card .metrics .bad { color: #b91c1c; }
        .enrichment-page .strategy-card .err { color: #b91c1c; font-size: 12px; padding: 0.4rem; background: #fee2e2; border-radius: 4px; }
        .enrichment-page details summary { cursor: pointer; user-select: none; font-size: 12px; color: #444; }
        .enrichment-page pre { max-height: 400px; overflow: auto; background: #f3f3f3; padding: 0.5rem; border-radius: 4px; font-size: 11px; margin: 0.25rem 0 0; }
        .enrichment-page .diff-added { background: #d1fae5; color: #065f46; padding: 1px 3px; border-radius: 2px; }
        .enrichment-page .diff-removed { background: #fee2e2; color: #991b1b; padding: 1px 3px; border-radius: 2px; text-decoration: line-through; }
        .enrichment-page .diff-changed { background: #fef3c7; color: #92400e; padding: 1px 3px; border-radius: 2px; }
        .enrichment-page .diff-unchanged { color: #999; }
        .enrichment-page .diff-section { padding: 0.5rem; border: 1px solid #eee; border-radius: 4px; margin-bottom: 0.5rem; }
        .enrichment-page .diff-section.changed { border-color: #f59e0b; }
        .enrichment-page .diff-section.added { border-color: #10b981; }
        .enrichment-page .diff-section.removed { border-color: #ef4444; }
        .enrichment-page .diff-rabbi { padding: 0.35rem 0.5rem; margin: 0.25rem 0; background: #fafafa; border-radius: 3px; font-size: 13px; }
        .enrichment-page .diff-field-change { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #555; margin-left: 1rem; }

        /* Preview block inside strategy cards */
        .preview { margin-top: 0.25rem; padding: 0.3rem 0; display: flex; flex-direction: column; gap: 0.5rem; }
        .preview-section { padding: 0.4rem 0.5rem; background: #fafafa; border-left: 3px solid #ddd; border-radius: 2px; font-size: 12px; }
        .preview-section-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.2rem; }
        .preview-title { font-weight: 600; color: #222; }
        .preview-diff-dot { font-size: 10px; font-weight: 700; color: white; padding: 1px 6px; border-radius: 8px; cursor: help; }
        .preview-excerpt { font-family: Arial Hebrew, David, serif; direction: rtl; text-align: right; color: #666; font-size: 12px; margin-bottom: 0.3rem; }
        .preview-rabbis { display: flex; flex-direction: column; gap: 0.3rem; }
        .preview-rabbi { padding: 0.25rem 0.35rem; background: white; border: 1px solid #e5e5e5; border-radius: 3px; }
        .preview-rabbi-name { font-weight: 600; color: #1e293b; font-size: 12px; }
        .preview-generation { color: #7c3aed; font-weight: 400; margin-left: 0.3rem; font-size: 10px; font-family: ui-monospace, Menlo, monospace; }
        .preview-role { color: #555; font-size: 11px; margin-top: 0.15rem; line-height: 1.3; }
        .preview-opinion { font-family: Arial Hebrew, David, serif; direction: rtl; text-align: right; font-size: 12px; color: #0369a1; margin-top: 0.15rem; }
        .preview-opinion-ellipsis { color: #94a3b8; }
        .preview-rel-row { display: flex; align-items: baseline; gap: 0.4rem; font-size: 11px; margin-top: 0.15rem; }
        .preview-rel-label { font-weight: 600; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; padding: 1px 6px; border-radius: 2px; }
        .preview-rel-agrees { background: #cffafe; color: #0e7490; }
        .preview-rel-disagrees { background: #fee2e2; color: #991b1b; }
        .preview-rel-names { color: #1e293b; }
        .preview-refs, .preview-parallels { margin-top: 0.3rem; display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
        .preview-label { font-size: 10px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .preview-ref-badge { background: #fef3c7; color: #713f12; font-size: 11px; padding: 1px 6px; border-radius: 3px; font-family: Arial Hebrew, David, serif; cursor: help; }
        .preview-parallel-chip { background: #dbeafe; color: #1e3a8a; font-size: 11px; padding: 1px 6px; border-radius: 3px; font-family: ui-monospace, Menlo, monospace; }

        /* ARGUMENT-FLOW SIDEBAR — minimal neutral render */
        .sidebar-preview-wrap { margin: 1rem 0 1.5rem; }
        .sidebar-preview-hint { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 0.35rem; font-weight: 600; }
        .flow-sidebar {
          width: 340px;
          max-width: 340px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 13px;
          line-height: 1.5;
          color: #334155;
          background: transparent;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .flow-header { display: flex; align-items: baseline; gap: 0.35rem; color: #64748b; font-size: 12px; }
        .flow-tractate { font-weight: 600; color: #1e293b; }
        .flow-partial { margin-left: auto; font-size: 10px; color: #94a3b8; }
        .flow-daf-summary { font-size: 12.5px; color: #475569; margin: 0 0 0.25rem; line-height: 1.55; }

        /* Argument section = a logical group: header + summary + stack of rabbi cards + "…" */
        .flow-section { display: flex; flex-direction: column; gap: 0.35rem; }
        .flow-section-head { display: flex; align-items: baseline; gap: 0.35rem; margin: 0; font-weight: 600; }
        .flow-section-num { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #94a3b8; font-weight: 600; }
        .flow-section-title { color: #1e293b; font-size: 13.5px; line-height: 1.3; font-weight: 600; }
        .flow-section-summary { font-size: 12.5px; color: #475569; margin: 0 0 0.2rem; line-height: 1.5; }

        .flow-rabbis { display: flex; flex-direction: column; gap: 0.3rem; }
        .flow-rabbi { background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.4rem 0.6rem; }
        .flow-rabbi-name { font-size: 12.5px; color: #1e293b; font-weight: 600; display: flex; align-items: baseline; gap: 0.25rem; flex-wrap: wrap; }
        .flow-rabbi-he { font-family: Arial Hebrew, David, serif; color: #64748b; font-weight: 500; }
        .flow-rabbi-era { margin-left: auto; font-size: 10px; color: #94a3b8; font-weight: 400; white-space: nowrap; }
        .flow-rabbi-role { font-size: 12px; color: #475569; margin-top: 0.2rem; line-height: 1.45; }

        .flow-section-more { display: flex; justify-content: center; margin-top: 0.1rem; }
        .flow-more-btn {
          border: 1px dashed #e5e7eb;
          background: transparent;
          color: #94a3b8;
          font-size: 12px;
          cursor: pointer;
          padding: 0 0.7rem;
          line-height: 1.3;
          border-radius: 3px;
        }
        .flow-more-btn:hover { color: #475569; border-color: #cbd5e1; }

        .flow-detail { padding: 0.5rem 0.25rem 0; display: flex; flex-direction: column; gap: 0.4rem; }
        .flow-d-row { display: flex; gap: 0.5rem; align-items: baseline; }
        .flow-d-label { font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; width: 64px; flex-shrink: 0; }
        .flow-d-body { flex: 1; font-size: 11.5px; color: #334155; display: flex; flex-direction: column; gap: 0.2rem; }
        .flow-d-wrap { flex-direction: row; flex-wrap: wrap; gap: 0.35rem; }
        .flow-d-edge { line-height: 1.4; }
        .flow-d-plus  { color: #16a34a; font-weight: 700; margin-right: 4px; }
        .flow-d-minus { color: #b91c1c; font-weight: 700; margin-right: 4px; }
        .flow-d-prep  { color: #94a3b8; font-style: italic; }
        .flow-d-ref   { font-family: Arial Hebrew, David, serif; color: #64748b; cursor: help; }
        .flow-d-parallel { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: #64748b; }
        .flow-d-stars { color: #64748b; margin-right: 0.35rem; letter-spacing: 0.5px; }
        .flow-d-diff-reason { color: #475569; font-style: italic; }
      `}</style>

      <h1>Enrichment Strategy Lab</h1>
      <p style="color: #555; margin-top: 0;">
        Load a daf's cached skeleton, run each Stage-B enrichment strategy, and diff against the
        ground-truth <code>analyze:v5</code> if one exists. Pick a winner before the full Shas enrichment pass.
      </p>

      <section class="panel controls">
        <label>Tractate</label>
        <select
          value={tractate()}
          onChange={(e) => setTractate(e.currentTarget.value)}
        >
          <For each={TRACTATE_OPTIONS}>{(t) => <option value={t.value}>{t.value} · {t.label}</option>}</For>
        </select>
        <label>Daf</label>
        <input
          type="text"
          value={page()}
          onInput={(e) => setPage(e.currentTarget.value)}
          style="width: 5rem;"
          placeholder="5a"
        />
        <button class="primary" onClick={handleLoad}>
          Load skeleton
        </button>
        <button onClick={handleRunAll} disabled={!skeleton() || Object.values(running()).some(Boolean)}>
          Run all strategies
        </button>
        <button
          class="primary"
          onClick={handleRenderMerged}
          disabled={!skeleton() || MERGE_SET.some(s => running()[s])}
          style="background: #7c3aed; border-color: #6d28d9;"
        >
          Render merged view
        </button>
      </section>

      <Show when={loadKey() > 0}>
        {/* Skeleton panel */}
        <section class="panel">
          <h2 style="margin: 0 0 0.25rem; font-size: 17px;">
            Skeleton — {tractate()} {page()}
            <Show when={groundTruth()}>
              <span style="font-size: 12px; color: #2563eb; margin-left: 0.5rem;">✓ ground-truth available</span>
            </Show>
            <Show when={groundTruth.state === 'ready' && !groundTruth()}>
              <span style="font-size: 12px; color: #999; margin-left: 0.5rem;">(no ground-truth cached)</span>
            </Show>
          </h2>
          <Show when={skeleton.loading}>
            <p style="color: #666;">Loading skeleton (may take ~150s if not cached)…</p>
          </Show>
          <Show when={skeleton.error}>
            <p style="color: #b91c1c;">Error: {String(skeleton.error)}</p>
          </Show>
          <Show when={skeleton()}>
            {(s) => (
              <>
                <p style="margin: 0 0 0.5rem; color: #333;">{s().summary}</p>
                <div class="skeleton-sections">
                  <For each={s().sections}>
                    {(sec) => (
                      <div class="skel-section">
                        <h4>{sec.title}</h4>
                        <div class="excerpt">{sec.excerpt}</div>
                        <div class="rabbi-list">
                          <b>{sec.rabbiNames.length} voices:</b> {sec.rabbiNames.join(', ')}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </>
            )}
          </Show>
        </section>

        {/* Merged rendered view — sidebar-width argument-flow presentation. */}
        <Show when={mergedView()}>
          {(m) => (
            <div class="sidebar-preview-wrap">
              <div class="sidebar-preview-hint">Sidebar preview (340px)</div>
              <ArgumentFlowSidebar
                tractate={tractate()}
                page={page()}
                analysis={m()}
                partialNote={mergedReady() ? null : `partial ${MERGE_SET.filter(s => results()[s]).length}/${MERGE_SET.length}`}
              />
            </div>
          )}
        </Show>

        {/* Strategy grid */}
        <section class="panel">
          <h2 style="margin: 0 0 0.5rem; font-size: 17px;">Strategies</h2>
          <div class="strategy-grid">
            <For each={STRATEGIES}>{(s) => (
              <div class="strategy-card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <h3>{s.label}</h3>
                  <div style="display: flex; gap: 0.3rem;">
                    <button
                      onClick={() => handleRun(s.id)}
                      disabled={!skeleton() || !!running()[s.id]}
                    >
                      {running()[s.id] ? 'Running…' : 'Run'}
                    </button>
                    <Show when={results()[s.id] && groundTruth()}>
                      <button
                        onClick={() => setDiffAgainst(diffAgainst() === s.id ? null : s.id)}
                        style={diffAgainst() === s.id ? 'background: #fef3c7;' : ''}
                      >
                        Diff
                      </button>
                    </Show>
                  </div>
                </div>
                <p class="desc">{s.desc}</p>
                <Show when={errors()[s.id]}>
                  <div class="err">{errors()[s.id]}</div>
                </Show>
                <Show when={results()[s.id]}>
                  {(r) => {
                    const totalRabbis = r().sections.reduce((sum, sec) => sum + (sec.rabbis?.length ?? 0), 0);
                    const totalRefs = r().sections.reduce((sum, sec) => sum + (sec.references?.length ?? 0), 0);
                    const totalParallels = r().sections.reduce((sum, sec) => sum + (sec.parallels?.length ?? 0), 0);
                    return (
                      <>
                        <div class="metrics">
                          <div>elapsed: <b>{(r()._elapsed_ms / 1000).toFixed(1)}s</b> · calls: {r()._calls.length}</div>
                          <div>
                            sections: {r().sections.length} · rabbis: {totalRabbis}
                            <Show when={totalRefs > 0}>{' · refs: ' + totalRefs}</Show>
                            <Show when={totalParallels > 0}>{' · parallels: ' + totalParallels}</Show>
                            <Show when={r().difficulty}>{` · overall: ★${r().difficulty!.score}/5`}</Show>
                          </div>
                          <div>
                            warnings: <span class={(r()._warnings.length > 0 ? 'bad' : '')}>{r()._warnings.length}</span>
                            {' · '}
                            completion tokens:{' '}
                            {r()._calls.reduce((sum, c) => sum + (c.usage?.completion_tokens ?? 0), 0)}
                          </div>
                          <Show when={Object.keys(r()._metadata).length > 0}>
                            <div style="color: #888;">{JSON.stringify(r()._metadata)}</div>
                          </Show>
                        </div>
                        <details open>
                          <summary>Preview</summary>
                          <div class="preview">
                            <For each={r().sections}>{(sec) => <SectionPreview sec={sec} />}</For>
                          </div>
                        </details>
                        <Show when={r()._warnings.length > 0}>
                          <details>
                            <summary>{r()._warnings.length} warnings</summary>
                            <ul style="margin: 0.25rem 0; padding-left: 1rem; font-size: 11px;">
                              <For each={r()._warnings.slice(0, 15)}>{(w) => <li>{w}</li>}</For>
                            </ul>
                          </details>
                        </Show>
                        <details>
                          <summary>Full JSON</summary>
                          <pre>{JSON.stringify(r(), null, 2)}</pre>
                        </details>
                      </>
                    );
                  }}
                </Show>
              </div>
            )}</For>
          </div>
        </section>

        {/* Diff panel */}
        <Show when={groundTruth() && diffAgainst() && results()[diffAgainst()!]}>
          <section class="panel">
            <h2 style="margin: 0 0 0.25rem; font-size: 17px;">
              Diff: <code>{diffAgainst()}</code> vs ground-truth (<code>analyze:v5</code>)
            </h2>
            <p style="color: #666; font-size: 12px; margin: 0 0 0.5rem;">
              <span class="diff-added">added</span> · <span class="diff-removed">removed</span> · <span class="diff-changed">changed</span> · <span class="diff-unchanged">unchanged</span>
            </p>
            <For each={diffAnalyses(groundTruth()!, results()[diffAgainst()!]!)}>
              {(secDiff) => (
                <div class={`diff-section ${secDiff.status}`}>
                  <strong class={`diff-${secDiff.status}`}>
                    {secDiff.status === 'added' ? '+' : secDiff.status === 'removed' ? '−' : secDiff.status === 'changed' ? '~' : '='} {secDiff.title}
                  </strong>
                  <For each={secDiff.rabbis}>
                    {(rd) => (
                      <div class="diff-rabbi">
                        <span class={`diff-${rd.status}`}>
                          {rd.status === 'added' ? '+ ' : rd.status === 'removed' ? '− ' : rd.status === 'changed' ? '~ ' : '= '}
                          {rd.right?.name ?? rd.left?.name} ({rd.right?.nameHe ?? rd.left?.nameHe ?? ''})
                        </span>
                        <For each={rd.fields}>
                          {(f) => (
                            <div class="diff-field-change">
                              <span style="color: #92400e;">{f.field}:</span> <span class="diff-removed">{f.a || '(empty)'}</span> → <span class="diff-added">{f.b || '(empty)'}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </section>
        </Show>
      </Show>

      <Show when={loadKey() === 0}>
        <section class="panel" style="text-align: center; color: #666;">
          Pick a tractate + daf and click <b>Load skeleton</b> to begin.
        </section>
      </Show>
    </div>
  );
}

export default EnrichmentPage;
