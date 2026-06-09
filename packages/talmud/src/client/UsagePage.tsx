import { createResource, createSignal, For, type JSX, onCleanup, Show } from 'solid-js';
import { estimateShasCost, type ProducerCost } from '../lib/shasCost';
import { t } from './i18n';

interface PerEndpoint {
  count: number;
  cacheHits: number;
  cacheHitRate: number;
  p50Ms: number;
  p95Ms: number;
  errorCount: number;
  errorsByKind: Record<string, number>;
}

interface RecentError {
  ts: number;
  endpoint: string;
  tractate?: string;
  page?: string;
  error_kind?: string;
  model?: string;
  mark_id?: string;
  enrichment_id?: string;
}

interface JobError {
  ts: number;
  runId: string;
  kind: string;
  id?: string;
  tractate: string;
  page: string;
  error: string;
  totalMs: number;
  queueWaitMs?: number;
}

interface BugReport {
  ts: number;
  tractate: string;
  page: string;
  description: string;
  ua: string | null;
  country: string | null;
}

interface LintFailure {
  at: number;
  enrichmentId: string;
  tractate: string;
  page: string;
  lang: 'en' | 'he';
  attempts: number;
  issues: string[];
}

interface LintFailuresSummary {
  recent: LintFailure[];
  counts: Record<string, number>;
}

interface UsageBucket {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  costInUsd?: number;
  costOutUsd?: number;
  pricedCalls: number;
  unpricedCalls: number;
}

interface UsageSummary {
  totals: UsageBucket & { errors: number; cacheHits: number };
  series: Array<{ date: string } & UsageBucket & { errors: number; cacheHits: number }>;
  byModel: Record<string, UsageBucket>;
  byMark: Record<string, UsageBucket>;
  byEnrichment: Record<string, UsageBucket>;
  fromDate: string | null;
  toDate: string | null;
}

interface AigwModelRow {
  model: string;
  provider?: string;
  requests: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

interface AigwCost {
  configured: boolean;
  ok: boolean;
  error?: string;
  windowStart?: string;
  windowEnd?: string;
  requests?: number;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  byModel?: AigwModelRow[];
}

interface ZoneWindow {
  requests: number;
  visits: number;
}

interface ZoneActivity {
  configured: boolean;
  ok: boolean;
  error?: string;
  windowStart?: string;
  windowEnd?: string;
  byDay?: Array<{ date: string; requests: number; visits: number }>;
  byCountry?: Array<{ country: string; requests: number }>;
  totals?: { day: ZoneWindow; week: ZoneWindow; month: ZoneWindow };
}

interface UnknownRabbi {
  name: string;
  nameHe: string;
  generation?: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
  dafs: string[];
}

interface ObservedPlace {
  name: string;
  nameHe: string;
  kind?: string;
  region?: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
  dafs: string[];
}

interface ObservedConcept {
  term: string;
  termHe: string;
  gloss: string;
  category?: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
  dafs: string[];
}

interface UnknownSummary<T> {
  total: number;
  sightings: number;
  sample: T[];
}

interface AlignedSample {
  sampled: number;
  aligned: number;
  pct: number;
}
interface CacheBucket {
  count: number;
  percent: number;
  // Sampled "% of cached dapim that actually aligned" (see cache-stats.ts).
  // Optional so a stale cached payload predating the field still parses.
  aligned?: AlignedSample | null;
  // Denominator count/percent are measured against (DafYomi is per-daf, not
  // per-amud). Absent on older payloads → caller falls back to the daf total.
  denom?: number;
}

interface MarkRow {
  id: string;
  label: string;
  source: 'code' | 'kv';
  cache_version: string;
  count: number;
  heCount: number;
  percent: number;
  versions: Record<string, number>;
  staleCount: number;
  dependsOn?: string[]; // other marks this one depends on (v8+)
  dependsOnSources?: string[]; // Content-In sources this one reads (v8+)
}

interface EnrichmentRow {
  id: string;
  label: string;
  target_mark: string;
  scope: 'global' | 'local';
  source: 'code' | 'kv';
  cache_version: string;
  count: number;
  heCount: number;
  versions: Record<string, number>;
  staleCount: number;
}

type SourceOrigin = 'HB' | 'Sefaria' | 'DY';
interface SourceRow {
  id: string;
  origin: SourceOrigin;
  count: number;
  denom: number;
  percent: number;
  aligned?: AlignedSample | null;
}

interface CacheStats {
  generatedAt: string;
  total: number;
  source: {
    hebrewbooks: CacheBucket;
    gemara: CacheBucket;
    commentaries: CacheBucket;
    dafyomi?: CacheBucket; // added later; may be absent on a stale cached payload
  };
  // Per-content-piece breakdown (v8+); absent on a stale cached payload.
  sources?: SourceRow[];
  marks: MarkRow[];
  enrichments: EnrichmentRow[];
  rabbis: {
    totalRabbis: number;
    withBio: number;
    withSefariaBio: number | null;
    withWiki: number;
    withGeneration: number;
    withRegion: number;
    withPlaces: number;
    withHierarchyEdges: number;
    withFamily: number;
    withOrientation: number;
    unknownRabbis: number | null;
  };
  hierarchy: {
    totalNodes: number;
    processedNodes: number;
    nodesWithEdges: number;
    totalEdges: number;
    generatedAt: string | null;
  };
}

// ---- Per-section data loading -------------------------------------------
// Each dashboard section loads from its OWN endpoint so a slow one never blocks
// the rest, and we paint the last value from localStorage instantly then
// revalidate in the background — the page is useful on the first frame.

interface TelemetrySection {
  perEndpoint: Record<string, PerEndpoint>;
  perMark: Record<string, PerEndpoint>;
  perEnrichment: Record<string, PerEndpoint>;
  recentErrors: RecentError[];
  totalCount: number;
}
interface CostSectionData {
  selfTracked: UsageSummary | null;
  aiGateway: AigwCost;
  costAvoided?: { recentUsd: number; recentCalls: number };
}
interface BacklogSectionData {
  rabbis: UnknownSummary<UnknownRabbi>;
  places: UnknownSummary<ObservedPlace>;
  concepts: UnknownSummary<ObservedConcept>;
  reports?: { active: BugReport[]; done: BugReport[] };
}
interface HealthSectionData {
  jobErrors: JobError[];
  lintFailures: LintFailuresSummary;
}
interface DafLedgerBucket {
  calls: number;
  cost: number;
  costInEst: number;
  costOutEst: number;
}
interface LlmCostData {
  totalCostUsd: number;
  estInputCostUsd?: number;
  estOutputCostUsd?: number;
  byDaf?: Record<string, DafLedgerBucket>;
  byKind?: Record<string, { calls: number; cost: number }>;
}
interface DafVersionCost {
  version: string;
  lang: 'en' | 'he';
  billedUsd: number | null;
  estimatedUsd: number | null;
  costInUsd: number | null;
  costOutUsd: number | null;
  tokensIn: number;
  tokensOut: number;
}
interface DafMarkCost {
  id: string;
  label: string;
  current: DafVersionCost[];
  superseded: DafVersionCost[];
  totalUsd: number;
}
interface DafCostData {
  tractate: string;
  page: string;
  marks: DafMarkCost[];
  totals: { currentUsd: number; supersededUsd: number; totalUsd: number };
}

function readStored<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : undefined;
  } catch {
    return undefined;
  }
}
function writeStored(key: string, v: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* quota / disabled */
  }
}

interface Section<T> {
  value: () => T | undefined; // freshest network value, else the last stored snapshot
  loading: () => boolean;
  error: () => unknown;
  refetch: () => void;
}
// A section's data: fetched from `url`, snapshotted to localStorage under
// `storeKey` for instant first paint on the next visit.
function sectionResource<T>(url: string, storeKey: string): Section<T> {
  const [res, { refetch }] = createResource<T>(async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as T;
    writeStored(storeKey, data);
    return data;
  });
  return {
    // res() throws while pending/errored — guard on state and fall back to the
    // stored snapshot so a slow/failed refresh still shows the last good value.
    value: () => (res.state === 'ready' ? res() : readStored<T>(storeKey)),
    loading: () => res.loading,
    error: () => (res.state === 'errored' ? res.error : undefined),
    refetch: () => {
      void refetch();
    },
  };
}

// Shimmer placeholder shown while a section has no value yet (reuses the
// daf-pulse keyframe from styles.css).
function SkeletonBlock(props: { rows?: number }): JSX.Element {
  return (
    <div style={{ padding: '0.4rem 0' }} aria-hidden="true">
      <For each={Array.from({ length: props.rows ?? 3 })}>
        {(_, i) => (
          <div
            style={{
              height: '1.1rem',
              'border-radius': '4px',
              'margin-bottom': '0.55rem',
              width: i() % 3 === 2 ? '60%' : i() % 2 ? '85%' : '100%',
              background: '#eee',
              animation: 'daf-pulse 1.3s ease-in-out infinite',
            }}
          />
        )}
      </For>
    </div>
  );
}

// Renders a section's content once loaded; shows a skeleton while it first
// loads and an error line only when there's no value to fall back to.
function SectionShell<T>(props: {
  section: Section<T>;
  skeletonRows?: number;
  children: (v: T) => JSX.Element;
}): JSX.Element {
  return (
    <Show
      when={props.section.value()}
      fallback={
        <Show when={props.section.error()} fallback={<SkeletonBlock rows={props.skeletonRows} />}>
          <p style={{ color: '#c33', 'font-size': '0.85rem' }}>
            {t('usage.loadFailed', { error: String(props.section.error()) })}
          </p>
        </Show>
      }
    >
      {(v) => props.children(v())}
    </Show>
  );
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n === 0) return '$0';
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTokens(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

// Small inline spinner reusing the global `daf-spin` keyframe (styles.css).
function Spinner(props: { size?: string }): JSX.Element {
  const s = () => props.size ?? '0.8rem';
  return (
    <span
      style={{
        display: 'inline-block',
        width: s(),
        height: s(),
        'border-radius': '50%',
        border: '2px solid #ddd',
        'border-top-color': '#4b7bec',
        animation: 'daf-spin 0.8s linear infinite',
        'flex-shrink': 0,
      }}
    />
  );
}

interface SectionHeadingProps {
  title: string;
  hint?: string;
}
function SectionHeading(props: SectionHeadingProps): JSX.Element {
  return (
    <h2
      style={{
        'font-size': '0.95rem',
        'text-transform': 'uppercase',
        'letter-spacing': '0.05em',
        color: '#999',
        'margin-bottom': '0.5rem',
      }}
    >
      {props.title}
      <Show when={props.hint}>
        <span
          style={{
            'font-size': '0.75rem',
            color: '#888',
            'margin-left': '0.5rem',
            'text-transform': 'none',
            'letter-spacing': 'normal',
          }}
        >
          {props.hint}
        </span>
      </Show>
    </h2>
  );
}

// A detail table that's collapsed by default behind a clickable header (the
// long per-model / per-mark / per-daf tables push the summary cards off-screen
// otherwise). Open/closed is remembered per id in localStorage.
function Collapsible(props: {
  id: string;
  title: string;
  sub?: string;
  defaultOpen?: boolean;
  children: JSX.Element;
}): JSX.Element {
  const storageKey = `usage.collapse.${props.id}`;
  const initial = (() => {
    if (typeof window === 'undefined') return props.defaultOpen ?? false;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(storageKey);
    } catch {
      /* storage disabled */
    }
    if (saved === '1') return true;
    if (saved === '0') return false;
    return props.defaultOpen ?? false;
  })();
  const [open, setOpen] = createSignal(initial);
  const toggle = () => {
    const next = !open();
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? '1' : '0');
    } catch {
      /* quota / disabled */
    }
  };
  return (
    <div style={{ 'margin-top': '0.7rem' }}>
      <h3
        onClick={toggle}
        style={{
          'font-size': '0.8rem',
          color: '#777',
          margin: '0 0 0.4rem',
          cursor: 'pointer',
          'user-select': 'none',
          display: 'flex',
          'align-items': 'baseline',
          gap: '0.4rem',
        }}
      >
        <span style={{ color: '#bbb', 'font-size': '0.7rem', width: '0.7rem', 'flex-shrink': 0 }}>
          {open() ? '▾' : '▸'}
        </span>
        {props.title}
        <Show when={props.sub}>
          <span style={{ color: '#999', 'font-weight': 'normal' }}>{props.sub}</span>
        </Show>
      </h3>
      <Show when={open()}>{props.children}</Show>
    </div>
  );
}

const tableStyle = {
  width: '100%',
  'border-collapse': 'collapse',
  'font-size': '0.85rem',
} as const;
const thStyle = { padding: '0.4rem 0.5rem' } as const;

function ProgressBar(props: { percent: number }): JSX.Element {
  const complete = () => props.percent >= 100;
  return (
    <div
      style={{ height: '8px', background: '#f0f0f0', 'border-radius': '3px', overflow: 'hidden' }}
    >
      <div
        style={{
          width: `${Math.min(100, props.percent)}%`,
          height: '100%',
          background: complete() ? '#2a8a42' : '#4b7bec',
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}

// Current-version count for a mark/enrichment in language L (`:he` suffix =
// Hebrew bucket of the `versions` map).
function langCount(versions: Record<string, number>, cv: string, he: boolean): number {
  return versions[he ? `${cv}:he` : cv] ?? 0;
}

// ---- Content-In: the daf's source material, by piece ---------------------
// Each row is a named content piece (the cache key never shown), tagged with
// where it comes from: HB (HebrewBooks page), Sefaria, or DY (DafYomi). "Has
// content" is the sampled fraction of cached dapim that actually carried it.
const ORIGIN_STYLE: Record<SourceOrigin, { fg: string; bg: string }> = {
  HB: { fg: '#6b7280', bg: '#f3f4f6' },
  Sefaria: { fg: '#1d4ed8', bg: '#eef2ff' },
  DY: { fg: '#7c3aed', bg: '#f3e8ff' },
};
function OriginBadge(props: { origin: SourceOrigin }): JSX.Element {
  const s = () => ORIGIN_STYLE[props.origin];
  return (
    <span
      style={{
        'font-size': '0.65rem',
        'font-weight': 600,
        color: s().fg,
        background: s().bg,
        padding: '0.05rem 0.4rem',
        'border-radius': '3px',
        'margin-left': '0.4rem',
        'vertical-align': 'middle',
      }}
    >
      {props.origin}
    </span>
  );
}

function SourceRowView(props: { row: SourceRow }): JSX.Element {
  const r = () => props.row;
  const complete = () => r().percent >= 100;
  const aligned = () => r().aligned ?? null;
  const num = {
    padding: '0.45rem 0.5rem',
    'text-align': 'right' as const,
    'font-variant-numeric': 'tabular-nums',
  };
  return (
    <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
      <td style={{ padding: '0.45rem 0.5rem' }}>
        <span style={{ color: '#222' }}>{t(`usage.src.${r().id}`)}</span>
        <OriginBadge origin={r().origin} />
      </td>
      <td style={num}>
        {fmtInt(r().count)} / {fmtInt(r().denom)}
      </td>
      <td style={{ padding: '0.45rem 0.5rem', width: '26%' }}>
        <ProgressBar percent={r().percent} />
      </td>
      <td style={{ ...num, color: complete() ? '#2a8a42' : '#333', 'white-space': 'nowrap' }}>
        {r().percent.toFixed(1)}%
        <Show when={complete()}>
          <span style={{ 'margin-left': '0.3rem' }}>✓</span>
        </Show>
      </td>
      <td style={{ ...num, color: '#555', 'white-space': 'nowrap' }}>
        <Show when={aligned()} fallback={<span style={{ color: '#bbb' }}>—</span>}>
          {(a) => (
            <span
              title={t('usage.sources.alignedTitle', {
                aligned: fmtInt(a().aligned),
                sampled: fmtInt(a().sampled),
              })}
            >
              {a().pct.toFixed(0)}%
            </span>
          )}
        </Show>
      </td>
    </tr>
  );
}

function SourcesSection(props: { stats: CacheStats }): JSX.Element {
  // Prefer the v8 per-piece breakdown; fall back to the legacy 4-bucket shape
  // if a stale cached payload predates it.
  const rows = (): SourceRow[] => {
    // Drop the DafYomi aggregate row — each content type is shown as its own
    // primary DY row instead.
    if (props.stats.sources && props.stats.sources.length > 0)
      return props.stats.sources.filter((s) => s.id !== 'dy');
    const s = props.stats.source;
    const total = props.stats.total;
    const mk = (id: string, b: CacheBucket | undefined, origin: SourceOrigin): SourceRow => ({
      id,
      origin,
      count: b?.count ?? 0,
      denom: b?.denom ?? total,
      percent: b?.percent ?? 0,
      aligned: b?.aligned ?? null,
    });
    return [
      mk('hb', s.hebrewbooks, 'HB'),
      mk('gemara', s.gemara, 'Sefaria'),
      mk('commentaries', s.commentaries, 'Sefaria'),
      ...(s.dafyomi ? [mk('dy', s.dafyomi, 'DY')] : []),
    ];
  };
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
          <th style={thStyle}>{t('usage.col.source')}</th>
          <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.cached')}</th>
          <th style={thStyle} />
          <th style={{ ...thStyle, 'text-align': 'right' }}>%</th>
          <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.hasContent')}</th>
        </tr>
      </thead>
      <tbody>
        <For each={rows()}>{(row) => <SourceRowView row={row} />}</For>
      </tbody>
    </table>
  );
}

// ---- Content-Out: mark-first tree ----------------------------------------
// Each MARK is a row; expand it to see the enrichments built on top of it —
// local ones plus global ones (🌐), and which other marks it depends on.
function GlobeBadge(): JSX.Element {
  return (
    <span
      title={t('usage.global.title')}
      style={{ 'margin-left': '0.35rem', 'font-size': '0.8rem' }}
    >
      🌐
    </span>
  );
}

// Friendly label for a Content-In source-dependency string. Reuses the
// Content-In source labels where they line up; the context aggregates get their
// own wording.
function sourceDepLabel(id: string): string {
  const map: Record<string, string> = {
    gemara: 'usage.src.gemara',
    commentaries: 'usage.src.commentaries',
    mishna: 'usage.src.mishna',
    'halacha-refs': 'usage.src.halacha-refs',
    'yerushalmi-text': 'usage.src.yerushalmi',
    context: 'usage.srcdep.context',
    'context-light': 'usage.srcdep.contextLight',
  };
  return map[id] ? t(map[id]) : id;
}

// One coverage bar (a language slice): count · bar · %.
function CoverageBar(props: {
  label: string;
  count: number;
  percent: number;
  he?: boolean;
}): JSX.Element {
  const complete = () => props.percent >= 100;
  return (
    <div style={{ display: 'flex', 'align-items': 'center', gap: '0.5rem', margin: '0.12rem 0' }}>
      <span
        style={{
          'font-size': '0.66rem',
          color: props.he ? '#1d4ed8' : '#aaa',
          width: '1.3rem',
          'flex-shrink': 0,
        }}
      >
        {props.label}
      </span>
      <span
        style={{
          'font-variant-numeric': 'tabular-nums',
          'font-size': '0.8rem',
          color: '#555',
          width: '3.4rem',
          'text-align': 'right',
          'flex-shrink': 0,
        }}
      >
        {fmtInt(props.count)}
      </span>
      <div style={{ flex: 1 }}>
        <ProgressBar percent={props.percent} />
      </div>
      <span
        style={{
          'font-variant-numeric': 'tabular-nums',
          'font-size': '0.78rem',
          color: complete() ? '#2a8a42' : '#666',
          width: '3rem',
          'text-align': 'right',
          'flex-shrink': 0,
        }}
      >
        {props.percent.toFixed(1)}%
      </span>
    </div>
  );
}

function MarkTreeRow(props: {
  mark: MarkRow;
  total: number;
  enrichments: EnrichmentRow[];
  labelOf: (id: string) => string;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const m = () => props.mark;
  const percent = () => (props.total > 0 ? (m().count / props.total) * 100 : 0);
  const hePercent = () => (props.total > 0 ? (m().heCount / props.total) * 100 : 0);
  // This mark's enrichments (local + global), local first then global, each
  // alpha by label.
  const enr = () =>
    props.enrichments
      .filter((e) => e.target_mark === m().id)
      .sort((a, b) =>
        a.scope === b.scope ? a.label.localeCompare(b.label) : a.scope === 'local' ? -1 : 1,
      );
  const deps = () => m().dependsOn ?? [];
  const srcDeps = () => m().dependsOnSources ?? [];
  const num = {
    padding: '0.4rem 0.5rem',
    'text-align': 'right' as const,
    'font-variant-numeric': 'tabular-nums',
  };
  return (
    <>
      <tr
        style={{ 'border-bottom': '1px solid #f4f4f4', cursor: 'pointer' }}
        onClick={() => setOpen(!open())}
      >
        <td style={{ padding: '0.4rem 0.5rem', 'vertical-align': 'top' }}>
          <span
            style={{
              color: '#bbb',
              'margin-right': '0.4rem',
              display: 'inline-block',
              width: '0.7rem',
            }}
          >
            {open() ? '▾' : '▸'}
          </span>
          <b>{m().label}</b>
          <Show when={m().staleCount > 0}>
            <span style={{ 'font-size': '0.72rem', color: '#b58100', 'margin-left': '0.5rem' }}>
              {t('usage.staleBadge', { count: fmtInt(m().staleCount) })}
            </span>
          </Show>
        </td>
        <td style={{ padding: '0.3rem 0.5rem', width: '52%' }}>
          <CoverageBar label="EN" count={m().count} percent={percent()} />
          <Show when={m().heCount > 0}>
            <CoverageBar label="HE" count={m().heCount} percent={hePercent()} he />
          </Show>
        </td>
      </tr>
      <Show when={open()}>
        <tr style={{ background: '#fbfbfa' }}>
          <td colspan={2} style={{ padding: '0.2rem 0.5rem 0.7rem 1.7rem' }}>
            <Show when={deps().length > 0}>
              <div style={{ 'font-size': '0.75rem', color: '#7c3aed', 'margin-bottom': '0.35rem' }}>
                {t('usage.tree.dependsOn')}:{' '}
                {deps()
                  .map((d) => props.labelOf(d))
                  .join(' · ')}
              </div>
            </Show>
            <Show when={srcDeps().length > 0}>
              <div style={{ 'font-size': '0.75rem', color: '#1d4ed8', 'margin-bottom': '0.35rem' }}>
                {t('usage.tree.dependsOnSources')}:{' '}
                {srcDeps()
                  .map((s) => sourceDepLabel(s))
                  .join(' · ')}
              </div>
            </Show>
            <Show
              when={enr().length > 0}
              fallback={
                <p style={{ color: '#aaa', 'font-size': '0.8rem' }}>{t('usage.tree.noEnrich')}</p>
              }
            >
              <table style={tableStyle}>
                <thead>
                  <tr
                    style={{
                      'text-align': 'left',
                      'border-bottom': '1px solid #eee',
                      color: '#888',
                      'font-size': '0.78rem',
                    }}
                  >
                    <th style={thStyle}>{t('usage.col.enrichment')}</th>
                    <th style={{ ...thStyle, 'text-align': 'right' }}>EN</th>
                    <th style={{ ...thStyle, 'text-align': 'right' }}>HE</th>
                    <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.stale')}</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={enr()}>
                    {(e) => (
                      <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                        <td style={{ padding: '0.35rem 0.5rem' }}>
                          {e.label}
                          <Show when={e.scope === 'global'}>
                            <GlobeBadge />
                          </Show>
                        </td>
                        <td style={{ ...num }}>
                          {fmtInt(langCount(e.versions, e.cache_version, false))}
                        </td>
                        <td style={{ ...num, color: e.heCount > 0 ? '#1d4ed8' : '#bbb' }}>
                          {e.heCount > 0
                            ? fmtInt(langCount(e.versions, e.cache_version, true))
                            : '—'}
                        </td>
                        <td style={{ ...num, color: e.staleCount ? '#b58100' : '#bbb' }}>
                          {e.staleCount ? fmtInt(e.staleCount) : '—'}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </td>
        </tr>
      </Show>
    </>
  );
}

function NotesSection(props: { stats: CacheStats }): JSX.Element {
  const total = () => props.stats.total;
  const marks = () => [...props.stats.marks].sort((a, b) => a.label.localeCompare(b.label));
  const enrichments = () => props.stats.enrichments;
  const labelOf = (id: string): string => props.stats.marks.find((m) => m.id === id)?.label ?? id;
  return (
    <>
      <SectionHeading title={t('usage.anchors.title')} hint={t('usage.tree.hint')} />
      <Show
        when={marks().length > 0}
        fallback={<p style={{ color: '#888' }}>{t('usage.anchors.empty')}</p>}
      >
        <table style={tableStyle}>
          <thead>
            <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
              <th style={thStyle}>{t('usage.col.anchor')}</th>
              <th style={thStyle}>{t('usage.col.coverage')}</th>
            </tr>
          </thead>
          <tbody>
            <For each={marks()}>
              {(mk) => (
                <MarkTreeRow
                  mark={mk}
                  total={total()}
                  enrichments={enrichments()}
                  labelOf={labelOf}
                />
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </>
  );
}

// ---- Needs-enrichment backlog -------------------------------------------
function BacklogSection(props: {
  rabbis: UnknownSummary<UnknownRabbi>;
  places: UnknownSummary<ObservedPlace>;
  concepts: UnknownSummary<ObservedConcept>;
  reports?: { active: BugReport[]; done: BugReport[] };
}): JSX.Element {
  const combinedTotal = () => props.rabbis.total + props.places.total + props.concepts.total;
  return (
    <>
      {/* User-submitted bug reports at the top — check them off as you triage. */}
      <Show when={props.reports}>{(rep) => <BacklogReports reports={rep()} />}</Show>
      <p style={{ 'font-size': '0.82rem', color: '#555', margin: '0 0 0.7rem' }}>
        {t('usage.backlog.combined', { count: fmtInt(combinedTotal()) })}
      </p>
      <Collapsible
        id="backlog.rabbis"
        title={t('usage.backlog.rabbis.title')}
        sub={t('usage.backlog.distinct', { count: fmtInt(props.rabbis.total) })}
      >
        <Show
          when={props.rabbis.sample.length > 0}
          fallback={
            <p style={{ color: '#888', 'font-size': '0.82rem' }}>
              {t('usage.backlog.rabbis.empty')}
            </p>
          }
        >
          <table style={tableStyle}>
            <thead>
              <tr
                style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}
              >
                <th style={thStyle}>{t('usage.col.name')}</th>
                <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.seen')}</th>
                <th style={thStyle}>{t('usage.col.dafim')}</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.rabbis.sample}>
                {(u) => (
                  <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                    <td style={{ padding: '0.35rem 0.5rem' }}>
                      {u.nameHe || u.name}
                      <Show when={u.nameHe && u.name}>
                        <span
                          style={{ color: '#999', 'font-size': '0.75rem', 'margin-left': '0.4rem' }}
                        >
                          {u.name}
                        </span>
                      </Show>
                    </td>
                    <td
                      style={{
                        padding: '0.35rem 0.5rem',
                        'text-align': 'right',
                        'font-variant-numeric': 'tabular-nums',
                      }}
                    >
                      {u.count}
                    </td>
                    <td
                      style={{ padding: '0.35rem 0.5rem', 'font-size': '0.75rem', color: '#888' }}
                    >
                      {u.dafs.slice(0, 3).join(', ')}
                      {u.dafs.length > 3 ? '…' : ''}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </Collapsible>

      <Collapsible
        id="backlog.places"
        title={t('usage.backlog.places.title')}
        sub={t('usage.backlog.places.distinct', { count: fmtInt(props.places.total) })}
      >
        <Show
          when={props.places.sample.length > 0}
          fallback={
            <p style={{ color: '#888', 'font-size': '0.82rem' }}>
              {t('usage.backlog.places.empty')}
            </p>
          }
        >
          <table style={tableStyle}>
            <thead>
              <tr
                style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}
              >
                <th style={thStyle}>{t('usage.col.place')}</th>
                <th style={thStyle}>{t('usage.col.kind')}</th>
                <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.seen')}</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.places.sample}>
                {(p) => (
                  <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                    <td style={{ padding: '0.35rem 0.5rem' }}>
                      {p.nameHe || p.name}
                      <Show when={p.nameHe && p.name}>
                        <span
                          style={{ color: '#999', 'font-size': '0.75rem', 'margin-left': '0.4rem' }}
                        >
                          {p.name}
                        </span>
                      </Show>
                    </td>
                    <td
                      style={{ padding: '0.35rem 0.5rem', 'font-size': '0.78rem', color: '#777' }}
                    >
                      {p.kind ?? '—'}
                      {p.region ? ` · ${p.region}` : ''}
                    </td>
                    <td
                      style={{
                        padding: '0.35rem 0.5rem',
                        'text-align': 'right',
                        'font-variant-numeric': 'tabular-nums',
                      }}
                    >
                      {p.count}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </Collapsible>

      <Collapsible
        id="backlog.concepts"
        title={t('usage.backlog.concepts.title')}
        sub={t('usage.backlog.concepts.distinct', { count: fmtInt(props.concepts.total) })}
      >
        <Show
          when={props.concepts.sample.length > 0}
          fallback={
            <p style={{ color: '#888', 'font-size': '0.82rem' }}>
              {t('usage.backlog.concepts.empty')}
            </p>
          }
        >
          <table style={tableStyle}>
            <thead>
              <tr
                style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}
              >
                <th style={thStyle}>{t('usage.col.term')}</th>
                <th style={thStyle}>{t('usage.col.category')}</th>
                <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.seen')}</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.concepts.sample}>
                {(c) => (
                  <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                    <td style={{ padding: '0.35rem 0.5rem' }}>
                      {c.termHe || c.term}
                      <Show when={c.termHe && c.term}>
                        <span
                          style={{ color: '#999', 'font-size': '0.75rem', 'margin-left': '0.4rem' }}
                        >
                          {c.term}
                        </span>
                      </Show>
                    </td>
                    <td
                      style={{ padding: '0.35rem 0.5rem', 'font-size': '0.78rem', color: '#777' }}
                    >
                      {c.category ?? '—'}
                    </td>
                    <td
                      style={{
                        padding: '0.35rem 0.5rem',
                        'text-align': 'right',
                        'font-variant-numeric': 'tabular-nums',
                      }}
                    >
                      {c.count}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </Collapsible>
    </>
  );
}

// ---- Cost ----------------------------------------------------------------
function StatCard(props: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}): JSX.Element {
  return (
    <div
      style={{
        flex: '1 1 140px',
        'min-width': '130px',
        padding: '0.7rem 0.8rem',
        background: '#fcfcfa',
        border: '1px solid #eee',
        'border-radius': '6px',
      }}
    >
      <div
        style={{
          'font-size': '0.7rem',
          'text-transform': 'uppercase',
          'letter-spacing': '0.04em',
          color: '#999',
        }}
      >
        {props.label}
      </div>
      <div
        style={{
          'font-size': '1.25rem',
          'font-weight': 600,
          color: props.color ?? '#222',
          'font-variant-numeric': 'tabular-nums',
        }}
      >
        {props.value}
      </div>
      <Show when={props.sub}>
        <div style={{ 'font-size': '0.72rem', color: '#999' }}>{props.sub}</div>
      </Show>
    </div>
  );
}

// ---- Activity (CF zone analytics) ----------------------------------------
function ActivitySection(props: { activity: ZoneActivity }): JSX.Element {
  const a = () => props.activity;
  const totals = () => a().totals;
  const byDay = () => a().byDay ?? [];
  const maxDay = () => Math.max(1, ...byDay().map((d) => d.requests));
  const byCountry = () => a().byCountry ?? [];
  const countryTotal = () => byCountry().reduce((s, c) => s + c.requests, 0);
  return (
    <Show
      when={a().ok}
      fallback={
        <p
          style={{
            color: a().configured ? '#c33' : '#888',
            'font-size': '0.82rem',
            background: '#fafafa',
            padding: '0.5rem 0.7rem',
            'border-radius': '4px',
            border: '1px solid #eee',
          }}
        >
          <Show
            when={!a().configured}
            fallback={<>{t('usage.activity.queryFailed', { error: a().error ?? '' })}</>}
          >
            {t('usage.activity.notConfigured.before')}
            <code>wrangler secret put CF_ZONE_ANALYTICS_TOKEN</code>
            {t('usage.activity.notConfigured.after', { error: a().error ?? '' })}
          </Show>
        </p>
      }
    >
      {/* Lead with visitors (the human signal); requests + avg-per-visitor are
          the secondary detail in the sub-line. */}
      <div
        style={{ display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.8rem' }}
      >
        <For
          each={[
            {
              label: t('usage.activity.today'),
              w: totals()?.day,
              color: undefined as string | undefined,
            },
            { label: t('usage.activity.week'), w: totals()?.week, color: undefined },
            { label: t('usage.activity.month'), w: totals()?.month, color: '#0066CC' },
          ]}
        >
          {(card) => {
            const reqs = card.w?.requests ?? 0;
            const vis = card.w?.visits ?? 0;
            const avg = vis > 0 ? reqs / vis : 0;
            return (
              <StatCard
                label={card.label}
                value={fmtInt(vis)}
                color={card.color}
                sub={t('usage.activity.reqPerVisitor', {
                  requests: fmtInt(reqs),
                  avg: avg.toFixed(1),
                })}
              />
            );
          }}
        </For>
      </div>

      <Show when={byDay().length > 0}>
        <div style={{ 'margin-bottom': '0.9rem' }}>
          <div
            style={{
              'font-size': '0.75rem',
              color: '#999',
              'text-transform': 'uppercase',
              'letter-spacing': '0.04em',
              'margin-bottom': '0.3rem',
            }}
          >
            {t('usage.activity.trend')}
          </div>
          <div style={{ display: 'flex', 'align-items': 'flex-end', gap: '2px', height: '60px' }}>
            <For each={byDay()}>
              {(d) => (
                <div
                  title={`${d.date}: ${fmtInt(d.requests)}`}
                  style={{
                    flex: '1 1 0',
                    background: '#4b7bec',
                    'border-radius': '2px 2px 0 0',
                    height: `${Math.max(2, (d.requests / maxDay()) * 100)}%`,
                    'min-width': '3px',
                  }}
                />
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={byCountry().length > 0}>
        <div
          style={{
            'font-size': '0.75rem',
            color: '#999',
            'text-transform': 'uppercase',
            'letter-spacing': '0.04em',
            'margin-bottom': '0.2rem',
          }}
        >
          {t('usage.activity.fromWhere')}
        </div>
        <table style={tableStyle}>
          <tbody>
            <For each={byCountry()}>
              {(c) => (
                <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                  <td style={{ padding: '0.3rem 0.5rem' }}>
                    {c.country || t('usage.activity.unknownCountry')}
                  </td>
                  <td
                    style={{
                      padding: '0.3rem 0.5rem',
                      'text-align': 'right',
                      'font-variant-numeric': 'tabular-nums',
                      color: '#555',
                    }}
                  >
                    {fmtInt(c.requests)}
                  </td>
                  <td style={{ padding: '0.3rem 0.5rem', width: '40%' }}>
                    <div
                      style={{
                        height: '8px',
                        background: '#f0f0f0',
                        'border-radius': '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${countryTotal() > 0 ? Math.min(100, (c.requests / countryTotal()) * 100) : 0}%`,
                          height: '100%',
                          background: '#4b7bec',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </Show>
  );
}

function CostSection(props: { cost: CostSectionData; stats: CacheStats | undefined }): JSX.Element {
  const aigw = () => props.cost.aiGateway;
  const self = () => props.cost.selfTracked;
  const avoided = () => props.cost.costAvoided;

  // Per-producer estimate of the cost to warm ALL of shas at full depth. Each
  // producer's unit cost ($/priced call) is projected across its own fire-rate
  // over every amud, so the lightly-warmed long tail is counted honestly
  // (rather than the old "divide recent spend by the most-covered mark", which
  // reported ~$0 once any mark passed 100%). See src/lib/shasCost.ts.
  const shas = () => {
    const s = self();
    const st = props.stats;
    if (!s || !st || s.totals.costUsd <= 0) return null;
    const est = estimateShasCost({
      amudim: st.total,
      byMark: s.byMark,
      byEnrichment: s.byEnrichment,
      marks: st.marks,
      enrichments: st.enrichments,
      gatewayByModel: aigw().byModel,
    });
    return est.available ? est : null;
  };

  // Our daily rollups sliced into recent windows, so "what did we spend lately"
  // is answerable next to the provider's billed total. The provider number is
  // authoritative; our tracking adds per-producer attribution and should
  // converge with it as model coverage grows.
  const sumWindow = (n: number) => {
    const series = self()?.series ?? [];
    const w = series.slice(-n);
    return w.reduce((a, d) => ({ costUsd: a.costUsd + d.costUsd, calls: a.calls + d.calls }), {
      costUsd: 0,
      calls: 0,
    });
  };
  const last7 = () => sumWindow(7);
  const last30 = () => sumWindow(30);
  // How much of the provider's billed spend our 30-day tracking accounts for.
  const converge = () => {
    const billed = aigw().ok ? (aigw().costUsd ?? 0) : 0;
    if (billed <= 0) return null;
    return Math.round((last30().costUsd / billed) * 100);
  };

  return (
    <>
      {/* Total spent — authoritative, billed by the provider. */}
      <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '0.2rem 0 0.4rem' }}>
        {t('usage.cost.billed.title')}{' '}
        <span style={{ color: '#999', 'font-weight': 'normal' }}>{t('usage.cost.billed.sub')}</span>
      </h3>
      <Show
        when={aigw().ok}
        fallback={
          <p
            style={{
              color: aigw().configured ? '#c33' : '#888',
              'font-size': '0.82rem',
              background: '#fafafa',
              padding: '0.5rem 0.7rem',
              'border-radius': '4px',
              border: '1px solid #eee',
            }}
          >
            <Show
              when={!aigw().configured}
              fallback={<>{t('usage.aigw.queryFailed', { error: aigw().error ?? '' })}</>}
            >
              {t('usage.aigw.notConfigured.before')}
              <code>wrangler secret put CF_ANALYTICS_TOKEN</code>
              {t('usage.aigw.notConfigured.after', { error: aigw().error ?? '' })}
            </Show>
          </p>
        }
      >
        <div
          style={{ display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.6rem' }}
        >
          <StatCard
            label={t('usage.stat.totalCost')}
            value={fmtUsd(aigw().costUsd)}
            color="#2a8a42"
          />
          <StatCard label={t('usage.stat.requests')} value={fmtInt(aigw().requests ?? 0)} />
          <StatCard label={t('usage.stat.tokensIn')} value={fmtTokens(aigw().tokensIn)} />
          <StatCard label={t('usage.stat.tokensOut')} value={fmtTokens(aigw().tokensOut)} />
        </div>
        <Show when={(aigw().byModel?.length ?? 0) > 0}>
          <Collapsible
            id="aigwByModel"
            title={t('usage.byModel')}
            sub={t('usage.byModel.sub', { count: fmtInt(aigw().byModel?.length ?? 0) })}
          >
            <table style={tableStyle}>
              <thead>
                <tr
                  style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}
                >
                  <th style={thStyle}>{t('usage.col.model')}</th>
                  <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.requests')}</th>
                  <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.tokens')}</th>
                  <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.cost')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={aigw().byModel}>
                  {(m) => (
                    <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                      <td
                        style={{
                          padding: '0.4rem 0.5rem',
                          'font-family': 'monospace',
                          'font-size': '0.8rem',
                        }}
                      >
                        {m.model}
                      </td>
                      <td
                        style={{
                          padding: '0.4rem 0.5rem',
                          'text-align': 'right',
                          'font-variant-numeric': 'tabular-nums',
                        }}
                      >
                        {fmtInt(m.requests)}
                      </td>
                      <td
                        style={{
                          padding: '0.4rem 0.5rem',
                          'text-align': 'right',
                          'font-variant-numeric': 'tabular-nums',
                        }}
                      >
                        {fmtTokens(m.tokensIn + m.tokensOut)}
                      </td>
                      <td
                        style={{
                          padding: '0.4rem 0.5rem',
                          'text-align': 'right',
                          'font-variant-numeric': 'tabular-nums',
                        }}
                      >
                        {fmtUsd(m.costUsd)}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Collapsible>
        </Show>
      </Show>

      {/* Our own tracking — per-producer attribution, sliced into windows. */}
      <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '1.1rem 0 0.4rem' }}>
        {t('usage.cost.tracked.title')}{' '}
        <span style={{ color: '#999', 'font-weight': 'normal' }}>
          {self()?.fromDate
            ? t('usage.cost.tracked.subSince', { date: self()!.fromDate ?? '' })
            : t('usage.cost.tracked.sub')}
        </span>
      </h3>
      <Show
        when={self()}
        fallback={
          <p style={{ color: '#888', 'font-size': '0.82rem' }}>{t('usage.selfTracked.empty')}</p>
        }
      >
        {(s) => (
          <>
            {/* Spend by recent window — these should track the billed total above. */}
            <div
              style={{
                display: 'flex',
                gap: '0.6rem',
                'flex-wrap': 'wrap',
                'margin-bottom': '0.6rem',
              }}
            >
              <StatCard
                label={t('usage.cost.win7')}
                value={fmtUsd(last7().costUsd)}
                color="#2a8a42"
                sub={t('usage.cost.winCalls', { count: fmtInt(last7().calls) })}
              />
              <StatCard
                label={t('usage.cost.win30')}
                value={fmtUsd(last30().costUsd)}
                color="#2a8a42"
                sub={t('usage.cost.winCalls', { count: fmtInt(last30().calls) })}
              />
              <StatCard
                label={t('usage.cost.winAll')}
                value={fmtUsd(s().totals.costUsd)}
                color="#2a8a42"
                sub={t('usage.stat.pricedCalls', { count: fmtInt(s().totals.pricedCalls) })}
              />
              <Show when={(s().totals.costInUsd ?? 0) + (s().totals.costOutUsd ?? 0) > 0}>
                <StatCard
                  label={t('usage.stat.inOut')}
                  value={`${fmtUsd(s().totals.costInUsd ?? 0)} / ${fmtUsd(s().totals.costOutUsd ?? 0)}`}
                  sub={t('usage.stat.inOut.sub')}
                />
              </Show>
              <Show when={avoided() && avoided()!.recentCalls > 0}>
                <StatCard
                  label={t('usage.stat.costAvoided')}
                  value={fmtUsd(avoided()!.recentUsd)}
                  color="#1d4ed8"
                  sub={t('usage.stat.costAvoided.sub', { count: fmtInt(avoided()!.recentCalls) })}
                />
              </Show>
            </div>
            <div
              style={{
                display: 'flex',
                gap: '0.6rem',
                'flex-wrap': 'wrap',
                'margin-bottom': '0.6rem',
              }}
            >
              <StatCard
                label={t('usage.stat.llmCalls')}
                value={fmtInt(s().totals.calls)}
                sub={t('usage.stat.errored', { count: fmtInt(s().totals.errors) })}
              />
              <StatCard
                label={t('usage.stat.tokens')}
                value={fmtTokens(s().totals.tokensIn + s().totals.tokensOut)}
                sub={t('usage.stat.tokensInOut', {
                  in: fmtTokens(s().totals.tokensIn),
                  out: fmtTokens(s().totals.tokensOut),
                })}
              />
              <StatCard
                label={t('usage.stat.unpricedCalls')}
                value={fmtInt(s().totals.unpricedCalls)}
                sub={t('usage.stat.unpricedCalls.sub')}
              />
            </div>
            <Show when={converge() != null}>
              <p
                style={{
                  'font-size': '0.8rem',
                  color: '#555',
                  background: '#f5f8ff',
                  padding: '0.5rem 0.7rem',
                  'border-radius': '4px',
                  border: '1px solid #e0e8f5',
                  'margin-bottom': '0.7rem',
                }}
              >
                {t('usage.cost.converge', {
                  pct: String(converge()),
                  billed: fmtUsd(aigw().costUsd),
                })}
              </p>
            </Show>
            <Show
              when={Object.keys(s().byMark).length > 0 || Object.keys(s().byEnrichment).length > 0}
            >
              <CostBreakdown id="byMark" title={t('usage.byMark')} buckets={s().byMark} />
              <CostBreakdown
                id="byEnrichment"
                title={t('usage.byEnrichment')}
                buckets={s().byEnrichment}
              />
            </Show>
          </>
        )}
      </Show>

      {/* Cost to warm all of shas (per-producer estimate) */}
      <Show when={shas()}>{(est) => <ShasEstimate est={est()} />}</Show>
    </>
  );
}

function ShasEstimate(props: { est: ReturnType<typeof estimateShasCost> }): JSX.Element {
  const e = () => props.est;
  const gross = () => `${e().workersAiGrossUp.toFixed(2)}`;
  const amudim = () => fmtInt(e().amudim);
  // Show the cost drivers; the long tail past ~16 rows is individually tiny.
  const TOP = 16;
  const top = (): ProducerCost[] => e().byProducer.slice(0, TOP);
  const more = () => Math.max(0, e().byProducer.length - TOP);
  const numCell = {
    padding: '0.3rem 0.5rem',
    'text-align': 'right' as const,
    'font-variant-numeric': 'tabular-nums',
  };
  return (
    <>
      <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '1.1rem 0 0.4rem' }}>
        {t('usage.shas.title')}{' '}
        <span style={{ color: '#999', 'font-weight': 'normal' }}>
          {t('usage.shas.sub', { amudim: amudim() })}
        </span>
      </h3>
      <div
        style={{ display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.6rem' }}
      >
        <StatCard
          label={t('usage.shas.full')}
          value={fmtUsd(e().grossed.fullShasUsd)}
          color="#b3541e"
        />
        <StatCard
          label={t('usage.shas.perAmud')}
          value={fmtUsd(e().grossed.perAmudUsd)}
          color="#b3541e"
        />
        <StatCard
          label={t('usage.shas.spent')}
          value={fmtUsd(e().grossed.incurredUsd)}
          color="#2a8a42"
        />
        <StatCard label={t('usage.shas.remaining')} value={fmtUsd(e().grossed.remainingUsd)} />
      </div>
      <p
        style={{
          'font-size': '0.78rem',
          color: '#888',
          background: '#fafaf8',
          padding: '0.5rem 0.7rem',
          'border-radius': '4px',
          border: '1px solid #eee',
          'margin-bottom': '0.6rem',
        }}
      >
        {t('usage.shas.note', { amudim: amudim(), gross: gross() })}
      </p>
      <Collapsible
        id="shasByProducer"
        title={t('usage.shas.breakdown')}
        sub={t('usage.byModel.sub', { count: fmtInt(e().byProducer.length) })}
      >
        <table style={tableStyle}>
          <thead>
            <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
              <th style={thStyle}>{t('usage.shas.col.producer')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.shas.col.perCall')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>
                {t('usage.shas.col.firesPerAmud')}
              </th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.shas.col.spent')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.shas.col.remaining')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.shas.col.full')}</th>
            </tr>
          </thead>
          <tbody>
            <For each={top()}>
              {(p) => (
                <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                  <td
                    style={{
                      padding: '0.3rem 0.5rem',
                      'font-family': 'monospace',
                      'font-size': '0.78rem',
                    }}
                  >
                    {p.id}
                  </td>
                  <td style={numCell}>{fmtUsd(p.unitUsd)}</td>
                  <td style={{ ...numCell, color: '#999' }}>
                    {p.instancesPerAmud > 1.05 ? `${p.instancesPerAmud.toFixed(1)}×` : '1×'}
                  </td>
                  <td style={{ ...numCell, color: '#2a8a42' }}>{fmtUsd(p.incurredUsd)}</td>
                  <td style={numCell}>{fmtUsd(p.remainingUsd)}</td>
                  <td style={{ ...numCell, 'font-weight': 600 }}>{fmtUsd(p.fullShasUsd)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={more() > 0}>
          <div style={{ 'font-size': '0.75rem', color: '#aaa', 'margin-top': '0.3rem' }}>
            {t('usage.shas.more', { count: fmtInt(more()) })}
          </div>
        </Show>
      </Collapsible>
    </>
  );
}

function CostBreakdown(props: {
  id: string;
  title: string;
  buckets: Record<string, UsageBucket>;
}): JSX.Element {
  const rows = () =>
    Object.entries(props.buckets).sort(
      ([, a], [, b]) => b.costUsd - a.costUsd || b.calls - a.calls,
    );
  return (
    <Show when={rows().length > 0}>
      <Collapsible
        id={props.id}
        title={props.title}
        sub={t('usage.byModel.sub', { count: fmtInt(rows().length) })}
      >
        <table style={tableStyle}>
          <tbody>
            <For each={rows()}>
              {([id, b]) => (
                <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                  <td
                    style={{
                      padding: '0.3rem 0.5rem',
                      'font-family': 'monospace',
                      'font-size': '0.8rem',
                    }}
                  >
                    {id}
                  </td>
                  <td
                    style={{
                      padding: '0.3rem 0.5rem',
                      'text-align': 'right',
                      'font-variant-numeric': 'tabular-nums',
                      color: '#888',
                    }}
                  >
                    {t('usage.callsCount', { count: fmtInt(b.calls) })}
                  </td>
                  <td
                    style={{
                      padding: '0.3rem 0.5rem',
                      'text-align': 'right',
                      'font-variant-numeric': 'tabular-nums',
                      color: '#888',
                    }}
                  >
                    {fmtTokens(b.tokensIn + b.tokensOut)}
                  </td>
                  <td
                    style={{
                      padding: '0.3rem 0.5rem',
                      'text-align': 'right',
                      'font-variant-numeric': 'tabular-nums',
                    }}
                  >
                    {b.pricedCalls ? (
                      fmtUsd(b.costUsd)
                    ) : (
                      <span style={{ color: '#bbb' }}>{t('usage.unpriced')}</span>
                    )}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Collapsible>
    </Show>
  );
}

// ---- Latency -------------------------------------------------------------
function LatencyTable(props: {
  title: string;
  hint?: string;
  rows: Array<[string, PerEndpoint]>;
}): JSX.Element {
  return (
    <section style={{ 'margin-bottom': '1.6rem' }}>
      <SectionHeading title={props.title} hint={props.hint} />
      <Show
        when={props.rows.length > 0}
        fallback={<p style={{ color: '#888' }}>{t('usage.noDataYet')}</p>}
      >
        <table style={tableStyle}>
          <thead>
            <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
              <th style={thStyle}>{t('usage.col.name')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.calls')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.cacheHit')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>p50</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>p95</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.errors')}</th>
              <th style={thStyle}>{t('usage.col.kinds')}</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {([name, row]) => (
                <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                  <td style={{ padding: '0.4rem 0.5rem', 'font-family': 'monospace' }}>{name}</td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>{row.count}</td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>
                    {row.count ? `${Math.round(row.cacheHitRate * 100)}%` : '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>
                    {row.count ? fmtMs(row.p50Ms) : '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>
                    {row.count ? fmtMs(row.p95Ms) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '0.4rem 0.5rem',
                      'text-align': 'right',
                      color: row.errorCount ? '#c33' : '#888',
                    }}
                  >
                    {row.errorCount}
                  </td>
                  <td style={{ padding: '0.4rem 0.5rem', 'font-size': '0.75rem', color: '#888' }}>
                    {Object.entries(row.errorsByKind)
                      .map(([k, n]) => `${k}:${n}`)
                      .join(', ')}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  );
}

// ---- Per-daf cost drill-down ---------------------------------------------
function bestVersionUsd(v: { billedUsd: number | null; estimatedUsd: number | null }): number {
  return v.billedUsd ?? v.estimatedUsd ?? 0;
}
function sumVersions(vs: DafVersionCost[]): number {
  return vs.reduce((s, v) => s + bestVersionUsd(v), 0);
}

// One expandable row of the by-daf cost table. The byDaf ledger row gives the
// RECENT spend (last 7 days, all kinds incl. source alignment); expanding fetches
// /api/usage/daf/:t/:p for the PERMANENT per-mark current-vs-superseded stamps.
function ByDafRow(props: { daf: string; bucket: DafLedgerBucket }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const parts = () => {
    const i = props.daf.indexOf(':');
    return { t: props.daf.slice(0, i), p: props.daf.slice(i + 1) };
  };
  const [drill] = createResource(
    () => (open() ? parts() : null),
    async (pp): Promise<DafCostData> => {
      const r = await fetch(
        `/api/usage/daf/${encodeURIComponent(pp.t)}/${encodeURIComponent(pp.p)}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  );
  const numCell = {
    padding: '0.35rem 0.5rem',
    'text-align': 'right' as const,
    'font-variant-numeric': 'tabular-nums',
  };
  return (
    <>
      <tr
        style={{ 'border-bottom': '1px solid #f4f4f4', cursor: 'pointer' }}
        onClick={() => setOpen(!open())}
      >
        <td style={{ padding: '0.35rem 0.5rem' }}>
          <span
            style={{
              color: '#bbb',
              'margin-right': '0.4rem',
              display: 'inline-block',
              width: '0.7rem',
            }}
          >
            {open() ? '▾' : '▸'}
          </span>
          {parts().t} {parts().p}
        </td>
        <td style={{ ...numCell, color: '#888' }}>{fmtInt(props.bucket.calls)}</td>
        <td style={{ ...numCell, color: '#888' }}>
          {fmtUsd(props.bucket.costInEst)} / {fmtUsd(props.bucket.costOutEst)}
        </td>
        <td style={{ ...numCell, 'font-weight': 600 }}>{fmtUsd(props.bucket.cost)}</td>
      </tr>
      <Show when={open()}>
        <tr style={{ background: '#fbfbfa' }}>
          <td colspan={4} style={{ padding: '0.3rem 0.5rem 0.7rem 1.6rem' }}>
            <div
              style={{
                'font-size': '0.75rem',
                color: '#999',
                'text-transform': 'uppercase',
                'letter-spacing': '0.04em',
                'margin-bottom': '0.3rem',
              }}
            >
              {t('usage.daf.permanentTitle')}
            </div>
            {/* Guard on resource state: reading drill() while it's errored throws,
                so branch on state instead of accessing the value unconditionally. */}
            <Show
              when={drill.state !== 'errored'}
              fallback={
                <p style={{ color: '#c33', 'font-size': '0.8rem' }}>
                  {t('usage.loadFailed', { error: String(drill.error) })}
                </p>
              }
            >
              <Show
                when={drill.state === 'ready' ? drill() : undefined}
                fallback={<SkeletonBlock rows={2} />}
              >
                {(rep) => (
                  <Show
                    when={rep().marks.length > 0}
                    fallback={
                      <p style={{ color: '#aaa', 'font-size': '0.8rem' }}>{t('usage.daf.empty')}</p>
                    }
                  >
                    <table style={tableStyle}>
                      <thead>
                        <tr
                          style={{
                            'text-align': 'left',
                            'border-bottom': '1px solid #eee',
                            color: '#666',
                          }}
                        >
                          <th style={thStyle}>{t('usage.daf.col.mark')}</th>
                          <th style={{ ...thStyle, 'text-align': 'right' }}>
                            {t('usage.daf.col.current')}
                          </th>
                          <th style={{ ...thStyle, 'text-align': 'right' }}>
                            {t('usage.daf.col.superseded')}
                          </th>
                          <th style={{ ...thStyle, 'text-align': 'right' }}>
                            {t('usage.col.cost')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={rep().marks}>
                          {(m) => (
                            <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                              <td
                                style={{
                                  padding: '0.3rem 0.5rem',
                                  'font-family': 'monospace',
                                  'font-size': '0.78rem',
                                }}
                              >
                                {m.id}
                              </td>
                              <td
                                style={{
                                  padding: '0.3rem 0.5rem',
                                  'text-align': 'right',
                                  'font-variant-numeric': 'tabular-nums',
                                  color: '#2a8a42',
                                }}
                              >
                                {fmtUsd(sumVersions(m.current))}
                              </td>
                              <td
                                style={{
                                  padding: '0.3rem 0.5rem',
                                  'text-align': 'right',
                                  'font-variant-numeric': 'tabular-nums',
                                  color: m.superseded.length ? '#b58100' : '#bbb',
                                }}
                              >
                                {m.superseded.length ? fmtUsd(sumVersions(m.superseded)) : '—'}
                              </td>
                              <td
                                style={{
                                  padding: '0.3rem 0.5rem',
                                  'text-align': 'right',
                                  'font-variant-numeric': 'tabular-nums',
                                  'font-weight': 600,
                                }}
                              >
                                {fmtUsd(m.totalUsd)}
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                      <tfoot>
                        <tr style={{ 'border-top': '1px solid #eee', color: '#555' }}>
                          <td style={{ padding: '0.3rem 0.5rem' }}>{t('usage.daf.total')}</td>
                          <td
                            style={{
                              padding: '0.3rem 0.5rem',
                              'text-align': 'right',
                              'font-variant-numeric': 'tabular-nums',
                            }}
                          >
                            {fmtUsd(rep().totals.currentUsd)}
                          </td>
                          <td
                            style={{
                              padding: '0.3rem 0.5rem',
                              'text-align': 'right',
                              'font-variant-numeric': 'tabular-nums',
                            }}
                          >
                            {fmtUsd(rep().totals.supersededUsd)}
                          </td>
                          <td
                            style={{
                              padding: '0.3rem 0.5rem',
                              'text-align': 'right',
                              'font-variant-numeric': 'tabular-nums',
                              'font-weight': 600,
                            }}
                          >
                            {fmtUsd(rep().totals.totalUsd)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </Show>
                )}
              </Show>
            </Show>
          </td>
        </tr>
      </Show>
    </>
  );
}

function ByDafCostTable(props: { llmCost: LlmCostData | undefined }): JSX.Element {
  const TOP = 40;
  const rows = () => {
    const byDaf = props.llmCost?.byDaf ?? {};
    return Object.entries(byDaf)
      .sort(([, a], [, b]) => b.cost - a.cost || b.calls - a.calls)
      .slice(0, TOP);
  };
  return (
    <Collapsible id="byDaf" title={t('usage.byDaf.title')} sub={t('usage.byDaf.sub')}>
      <Show
        when={rows().length > 0}
        fallback={<p style={{ color: '#888', 'font-size': '0.82rem' }}>{t('usage.byDaf.empty')}</p>}
      >
        <table style={tableStyle}>
          <thead>
            <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
              <th style={thStyle}>{t('usage.col.daf')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.calls')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.inOut')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.cost')}</th>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>{([daf, bucket]) => <ByDafRow daf={daf} bucket={bucket} />}</For>
          </tbody>
        </table>
      </Show>
    </Collapsible>
  );
}

// ---- Grouped Health sections (telemetry + operational errors) ------------
// "studio-*" telemetry endpoints are legacy stored labels; show plain names.
function displayEndpoint(name: string): string {
  if (name === 'studio-mark') return t('usage.run.mark');
  if (name === 'studio-enrichment') return t('usage.run.enrichment');
  if (name === 'studio-adhoc') return t('usage.run.adhoc');
  if (name === 'translate') return t('usage.run.translate');
  return name;
}

// ---- Health: Speed -------------------------------------------------------
function SpeedSection(props: { telemetry: TelemetrySection }): JSX.Element {
  const d = () => props.telemetry;
  const endpointRows = () =>
    Object.entries(d().perEndpoint)
      .map(([k, v]) => [displayEndpoint(k), v] as [string, PerEndpoint])
      .sort(([a], [b]) => a.localeCompare(b));
  return (
    <Collapsible id="health.speed" title={t('usage.health.speed')} defaultOpen>
      <LatencyTable
        title={t('usage.latency.byEndpoint', { count: d().totalCount })}
        rows={endpointRows()}
      />
      <LatencyTable
        title={t('usage.latency.byMark')}
        hint={t('usage.latency.byMark.hint')}
        rows={Object.entries(d().perMark).sort(([a], [b]) => a.localeCompare(b))}
      />
      <LatencyTable
        title={t('usage.latency.byEnrichment')}
        hint={t('usage.latency.byEnrichment.hint')}
        rows={Object.entries(d().perEnrichment).sort(([a], [b]) => a.localeCompare(b))}
      />
    </Collapsible>
  );
}

// ---- Health: Cache efficiency --------------------------------------------
// Is the cache doing its job — how often we serve a hit, and how much cached
// content is stale (old cache_version, needs re-warming).
function CacheSection(props: {
  telemetry: TelemetrySection;
  stats: CacheStats | undefined;
}): JSX.Element {
  const d = () => props.telemetry;
  const overall = () => {
    let calls = 0,
      hits = 0;
    for (const r of Object.values(d().perEndpoint)) {
      calls += r.count;
      hits += r.cacheHits;
    }
    return { calls, hits, rate: calls > 0 ? hits / calls : 0 };
  };
  const staleTotal = () => {
    const st = props.stats;
    if (!st) return null;
    let n = 0;
    for (const m of st.marks) n += m.staleCount;
    for (const e of st.enrichments) n += e.staleCount;
    return n;
  };
  // Per-producer hit rate (marks + enrichments), busiest first.
  const producerRows = () =>
    [...Object.entries(d().perMark), ...Object.entries(d().perEnrichment)]
      .filter(([, r]) => r.count > 0)
      .sort(([, a], [, b]) => b.count - a.count);
  return (
    <Collapsible id="health.cache" title={t('usage.health.cache')}>
      <div
        style={{ display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.6rem' }}
      >
        <StatCard
          label={t('usage.cacheStat.hitRate')}
          value={`${Math.round(overall().rate * 100)}%`}
          color="#1d4ed8"
          sub={t('usage.cacheStat.hitRate.sub', {
            hits: fmtInt(overall().hits),
            calls: fmtInt(overall().calls),
          })}
        />
        <Show when={staleTotal() != null}>
          <StatCard
            label={t('usage.cacheStat.stale')}
            value={fmtInt(staleTotal()!)}
            color={staleTotal()! > 0 ? '#b58100' : '#2a8a42'}
            sub={t('usage.cacheStat.stale.sub')}
          />
        </Show>
      </div>
      <Show when={producerRows().length > 0}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
              <th style={thStyle}>{t('usage.col.name')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.calls')}</th>
              <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.cacheHit')}</th>
            </tr>
          </thead>
          <tbody>
            <For each={producerRows()}>
              {([name, row]) => (
                <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                  <td style={{ padding: '0.35rem 0.5rem', 'font-family': 'monospace' }}>{name}</td>
                  <td
                    style={{
                      padding: '0.35rem 0.5rem',
                      'text-align': 'right',
                      'font-variant-numeric': 'tabular-nums',
                    }}
                  >
                    {row.count}
                  </td>
                  <td
                    style={{
                      padding: '0.35rem 0.5rem',
                      'text-align': 'right',
                      'font-variant-numeric': 'tabular-nums',
                    }}
                  >
                    {Math.round(row.cacheHitRate * 100)}%
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </Collapsible>
  );
}

// ---- Health: Errors (recent telemetry + queue failures + lint) -----------
function ErrorsSection(props: {
  recentErrors: RecentError[];
  health: HealthSectionData;
}): JSX.Element {
  const d = () => props.health;
  const recentErrors = () => props.recentErrors;
  return (
    <Collapsible id="health.errors" title={t('usage.health.errors')} defaultOpen>
      <section style={{ 'margin-bottom': '1.2rem' }}>
        <SectionHeading title={t('usage.recentErrors.title')} hint={t('usage.recentErrors.hint')} />
        <Show
          when={recentErrors().length > 0}
          fallback={<p style={{ color: '#888' }}>{t('usage.none')}</p>}
        >
          <ul style={{ 'list-style': 'none', padding: 0, margin: 0, 'font-size': '0.8rem' }}>
            <For each={recentErrors()}>
              {(e) => (
                <li
                  style={{
                    padding: '0.3rem 0',
                    'border-bottom': '1px solid #f4f4f4',
                    display: 'flex',
                    gap: '0.6rem',
                    'flex-wrap': 'wrap',
                  }}
                >
                  <span style={{ color: '#999', 'white-space': 'nowrap' }}>{fmtTime(e.ts)}</span>
                  <span style={{ 'font-family': 'monospace' }}>{displayEndpoint(e.endpoint)}</span>
                  <Show when={e.mark_id}>
                    <span style={{ 'font-family': 'monospace', color: '#555' }}>
                      mark={e.mark_id}
                    </span>
                  </Show>
                  <Show when={e.enrichment_id}>
                    <span style={{ 'font-family': 'monospace', color: '#555' }}>
                      enrich={e.enrichment_id}
                    </span>
                  </Show>
                  <Show when={e.tractate || e.page}>
                    <span style={{ color: '#666' }}>
                      {e.tractate} {e.page}
                    </span>
                  </Show>
                  <span style={{ color: '#c33' }}>
                    {e.error_kind ?? t('usage.errorKind.other')}
                  </span>
                  <Show when={e.model}>
                    <span style={{ color: '#888', 'font-size': '0.75rem' }}>({e.model})</span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <section style={{ 'margin-bottom': '1.6rem' }}>
        <SectionHeading
          title={t('usage.jobErrors.title', { count: d().jobErrors.length })}
          hint={t('usage.jobErrors.hint')}
        />
        <Show
          when={d().jobErrors.length > 0}
          fallback={<p style={{ color: '#888' }}>{t('usage.none')}</p>}
        >
          <ul style={{ 'list-style': 'none', padding: 0, margin: 0, 'font-size': '0.8rem' }}>
            <For each={d().jobErrors}>
              {(e) => (
                <li style={{ padding: '0.4rem 0', 'border-bottom': '1px solid #f4f4f4' }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.6rem',
                      'flex-wrap': 'wrap',
                      'margin-bottom': '0.15rem',
                    }}
                  >
                    <span style={{ color: '#999', 'white-space': 'nowrap' }}>{fmtTime(e.ts)}</span>
                    <span style={{ 'font-family': 'monospace', color: '#555' }}>
                      {e.kind}
                      {e.id ? `=${e.id}` : ''}
                    </span>
                    <span style={{ color: '#666' }}>
                      {e.tractate} {e.page}
                    </span>
                  </div>
                  <div
                    style={{
                      color: '#c33',
                      'font-family': 'monospace',
                      'font-size': '0.74rem',
                      'white-space': 'pre-wrap',
                    }}
                  >
                    {e.error}
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <section style={{ 'margin-bottom': '1.6rem' }}>
        <SectionHeading
          title={t('usage.lintFailures.title', { count: d().lintFailures.recent.length })}
          hint={t('usage.lintFailures.hint')}
        />
        <Show when={Object.keys(d().lintFailures.counts).length > 0}>
          <div
            style={{
              display: 'flex',
              gap: '0.4rem',
              'flex-wrap': 'wrap',
              'margin-bottom': '0.5rem',
            }}
          >
            <For each={Object.entries(d().lintFailures.counts).sort((a, b) => b[1] - a[1])}>
              {([id, n]) => (
                <span
                  style={{
                    'font-size': '0.74rem',
                    'font-family': 'monospace',
                    padding: '0.15rem 0.45rem',
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    'border-radius': '999px',
                    color: '#92400e',
                  }}
                >
                  {id} · {n}
                </span>
              )}
            </For>
          </div>
        </Show>
        <Show
          when={d().lintFailures.recent.length > 0}
          fallback={<p style={{ color: '#888' }}>{t('usage.none')}</p>}
        >
          <ul style={{ 'list-style': 'none', padding: 0, margin: 0, 'font-size': '0.8rem' }}>
            <For each={d().lintFailures.recent}>
              {(f) => (
                <li style={{ padding: '0.4rem 0', 'border-bottom': '1px solid #f4f4f4' }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.6rem',
                      'flex-wrap': 'wrap',
                      'margin-bottom': '0.15rem',
                    }}
                  >
                    <span style={{ color: '#999', 'white-space': 'nowrap' }}>{fmtTime(f.at)}</span>
                    <span style={{ 'font-family': 'monospace', color: '#555' }}>
                      {f.enrichmentId}
                    </span>
                    <span style={{ color: '#666' }}>
                      {f.tractate} {f.page}
                      {f.lang === 'he' ? ' · he' : ''}
                    </span>
                    <span style={{ color: '#92400e' }}>×{f.attempts}</span>
                  </div>
                  <div
                    style={{
                      color: '#a16207',
                      'font-family': 'monospace',
                      'font-size': '0.74rem',
                      'white-space': 'pre-wrap',
                    }}
                  >
                    {f.issues.join(' · ')}
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </Collapsible>
  );
}

// ---- Health: User reports ------------------------------------------------
// One bug report, with a check-off / restore button. Checking it off moves it
// to the collapsed "done" group (persisted server-side by report timestamp).
function ReportItem(props: {
  report: BugReport;
  done: boolean;
  onToggle: () => void;
}): JSX.Element {
  const r = () => props.report;
  return (
    <li
      style={{
        display: 'flex',
        gap: '0.6rem',
        'align-items': 'flex-start',
        padding: '0.6rem 0.7rem',
        margin: '0 0 0.45rem',
        background: '#fcfcfa',
        border: '1px solid #eee',
        'border-radius': '4px',
      }}
    >
      <button
        onClick={props.onToggle}
        title={props.done ? t('usage.reports.restore') : t('usage.reports.markDone')}
        style={{
          'flex-shrink': 0,
          width: '1.5rem',
          height: '1.5rem',
          'border-radius': '4px',
          border: `1px solid ${props.done ? '#2a8a42' : '#ccc'}`,
          background: props.done ? '#2a8a42' : '#fff',
          color: props.done ? '#fff' : '#888',
          cursor: 'pointer',
          'font-size': '0.85rem',
          'line-height': 1,
        }}
      >
        {props.done ? '↺' : '✓'}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ 'font-size': '0.75rem', color: '#888', 'margin-bottom': '0.25rem' }}>
          {fmtTime(r().ts)} ·{' '}
          <b>
            {r().tractate} {r().page}
          </b>
          <Show when={r().country}>
            <span> · {r().country}</span>
          </Show>
        </div>
        <div
          style={{
            'white-space': 'pre-wrap',
            'font-size': '0.88rem',
            color: props.done ? '#888' : '#222',
            'line-height': 1.45,
            'text-decoration': props.done ? 'line-through' : 'none',
          }}
        >
          {r().description}
        </div>
      </div>
    </li>
  );
}

function BacklogReports(props: {
  reports: { active: BugReport[]; done: BugReport[] };
}): JSX.Element {
  // Optimistic local overrides (ts → done?) layered on the server split, so a
  // click is instant; the POST persists it and invalidates the backlog cache.
  const [overrides, setOverrides] = createSignal<Record<number, boolean>>({});
  const toggle = (ts: number, done: boolean) => {
    setOverrides((o) => ({ ...o, [ts]: done }));
    void fetch('/api/admin/report-dismiss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ts, done }),
    }).catch(() => {});
  };
  const all = () => [...props.reports.active, ...props.reports.done];
  const isDone = (r: BugReport) =>
    overrides()[r.ts] ?? props.reports.done.some((d) => d.ts === r.ts);
  const active = () => all().filter((r) => !isDone(r));
  const done = () => all().filter((r) => isDone(r));
  return (
    <div style={{ 'margin-bottom': '1.3rem' }}>
      <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '0 0 0.4rem' }}>
        {t('usage.reports.title', { count: fmtInt(active().length) })}
      </h3>
      <Show
        when={active().length > 0}
        fallback={
          <p style={{ color: '#888', 'font-size': '0.82rem' }}>{t('usage.reports.empty')}</p>
        }
      >
        <ul style={{ 'list-style': 'none', padding: 0, margin: 0 }}>
          <For each={active()}>
            {(r) => <ReportItem report={r} done={false} onToggle={() => toggle(r.ts, true)} />}
          </For>
        </ul>
      </Show>
      <Show when={done().length > 0}>
        <Collapsible
          id="backlog.reportsDone"
          title={t('usage.reports.doneTitle', { count: fmtInt(done().length) })}
        >
          <ul style={{ 'list-style': 'none', padding: 0, margin: 0 }}>
            <For each={done()}>
              {(r) => <ReportItem report={r} done onToggle={() => toggle(r.ts, false)} />}
            </For>
          </ul>
        </Collapsible>
      </Show>
    </div>
  );
}

// ---- Tabbed dashboard ----------------------------------------------------
const TABS: Array<{ id: string; labelKey: string }> = [
  { id: 'traffic', labelKey: 'usage.tab.traffic' },
  { id: 'cost', labelKey: 'usage.tab.cost' },
  { id: 'health', labelKey: 'usage.tab.health' },
  { id: 'contentIn', labelKey: 'usage.tab.contentIn' },
  { id: 'contentOut', labelKey: 'usage.tab.contentOut' },
  { id: 'backlog', labelKey: 'usage.tab.backlog' },
];

export function UsagePage(): JSX.Element {
  // One resource per section, each loading from its own endpoint and snapshotted
  // to localStorage for an instant first paint on the next visit.
  const cost = sectionResource<CostSectionData>('/api/usage/cost', 'usage.snap.cost');
  const activity = sectionResource<ZoneActivity>('/api/usage/activity', 'usage.snap.activity');
  const telemetry = sectionResource<TelemetrySection>(
    '/api/usage/telemetry',
    'usage.snap.telemetry',
  );
  const backlog = sectionResource<BacklogSectionData>('/api/usage/backlog', 'usage.snap.backlog');
  const health = sectionResource<HealthSectionData>('/api/usage/health', 'usage.snap.health');
  const cacheStats = sectionResource<CacheStats>('/api/admin/cache-stats', 'usage.snap.cacheStats');
  const llmCost = sectionResource<LlmCostData>('/api/admin/llm-cost', 'usage.snap.llmcost');

  // Which resources back each tab — drives both the manual refresh button and
  // the auto-refresh timer (only the visible tab revalidates).
  const tabRefetch: Record<string, () => void> = {
    traffic: () => {
      activity.refetch();
    },
    cost: () => {
      cost.refetch();
      cacheStats.refetch();
      llmCost.refetch();
    },
    health: () => {
      telemetry.refetch();
      health.refetch();
      cacheStats.refetch();
    },
    contentIn: () => {
      cacheStats.refetch();
    },
    contentOut: () => {
      cacheStats.refetch();
      backlog.refetch();
    },
    backlog: () => {
      backlog.refetch();
    },
  };

  const [tab, setTab] = createSignal<string>(readStored<string>('usage.tab') ?? 'traffic');
  const selectTab = (id: string) => {
    setTab(id);
    writeStored('usage.tab', id);
  };

  const interval = setInterval(() => tabRefetch[tab()]?.(), 30000);
  onCleanup(() => clearInterval(interval));

  const busy = () =>
    cost.loading() ||
    activity.loading() ||
    telemetry.loading() ||
    backlog.loading() ||
    health.loading() ||
    cacheStats.loading() ||
    llmCost.loading();

  return (
    <main
      class="page-shell"
      style={{
        '--page-max': '960px',
        'font-family': 'system-ui, -apple-system, sans-serif',
        color: '#222',
      }}
    >
      <header class="responsive-row" style={{ 'margin-bottom': '1rem' }}>
        <h1
          style={{
            margin: 0,
            'font-size': '1.4rem',
            display: 'flex',
            'align-items': 'center',
            gap: '0.5rem',
          }}
        >
          {t('usage.title')}
          <Show when={busy()}>
            <Spinner />
          </Show>
        </h1>
        <a href="#daf" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>
          {t('usage.backToDaf')}
        </a>
        <button
          onClick={() => tabRefetch[tab()]?.()}
          disabled={busy()}
          style={{
            'margin-left': 'auto',
            padding: '0.3rem 0.7rem',
            border: '1px solid #ddd',
            'border-radius': '4px',
            background: '#fff',
            cursor: busy() ? 'default' : 'pointer',
            'font-size': '0.8rem',
            opacity: busy() ? 0.6 : 1,
          }}
        >
          {busy() ? t('usage.refreshing') : t('usage.refresh')}
        </button>
      </header>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '0.3rem',
          'flex-wrap': 'wrap',
          'border-bottom': '1px solid #eee',
          'margin-bottom': '1.2rem',
        }}
      >
        <For each={TABS}>
          {(tb) => {
            const active = () => tab() === tb.id;
            return (
              <button
                onClick={() => selectTab(tb.id)}
                style={{
                  padding: '0.45rem 0.9rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  'font-size': '0.88rem',
                  'font-weight': active() ? 600 : 400,
                  color: active() ? '#1d4ed8' : '#666',
                  'border-bottom': active() ? '2px solid #1d4ed8' : '2px solid transparent',
                  'margin-bottom': '-1px',
                }}
              >
                {t(tb.labelKey)}
              </button>
            );
          }}
        </For>
      </div>

      <Show when={tab() === 'traffic'}>
        <SectionShell section={activity} skeletonRows={4}>
          {(a) => <ActivitySection activity={a} />}
        </SectionShell>
      </Show>

      <Show when={tab() === 'cost'}>
        <SectionShell section={cost} skeletonRows={6}>
          {(c) => <CostSection cost={c} stats={cacheStats.value()} />}
        </SectionShell>
        <ByDafCostTable llmCost={llmCost.value()} />
      </Show>

      <Show when={tab() === 'health'}>
        <SectionShell section={telemetry} skeletonRows={5}>
          {(tel) => (
            <>
              <SpeedSection telemetry={tel} />
              <CacheSection telemetry={tel} stats={cacheStats.value()} />
            </>
          )}
        </SectionShell>
        <SectionShell section={health} skeletonRows={4}>
          {(h) => <ErrorsSection recentErrors={telemetry.value()?.recentErrors ?? []} health={h} />}
        </SectionShell>
      </Show>

      <Show when={tab() === 'contentIn'}>
        <SectionShell section={cacheStats} skeletonRows={5}>
          {(cs) => (
            <>
              <SectionHeading
                title={t('usage.sources.title')}
                hint={t('usage.sources.hint', { count: fmtInt(cs.total) })}
              />
              <SourcesSection stats={cs} />
            </>
          )}
        </SectionShell>
      </Show>

      <Show when={tab() === 'contentOut'}>
        <SectionShell section={cacheStats} skeletonRows={8}>
          {(cs) => <NotesSection stats={cs} />}
        </SectionShell>
      </Show>

      <Show when={tab() === 'backlog'}>
        <SectionShell section={backlog} skeletonRows={6}>
          {(b) => (
            <BacklogSection
              rabbis={b.rabbis}
              places={b.places}
              concepts={b.concepts}
              reports={b.reports}
            />
          )}
        </SectionShell>
      </Show>
    </main>
  );
}
