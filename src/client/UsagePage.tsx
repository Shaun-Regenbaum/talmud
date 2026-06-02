import { createResource, createSignal, For, Show, type JSX } from 'solid-js';
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

interface UsagePayload {
  telemetry: {
    perEndpoint: Record<string, PerEndpoint>;
    perMark: Record<string, PerEndpoint>;
    perEnrichment: Record<string, PerEndpoint>;
    recentErrors: RecentError[];
    totalCount: number;
  };
  cost: {
    selfTracked: UsageSummary | null;
    aiGateway: AigwCost;
  };
  activity: ZoneActivity;
  unknowns: {
    rabbis: UnknownSummary<UnknownRabbi>;
    places: UnknownSummary<ObservedPlace>;
    concepts: UnknownSummary<ObservedConcept>;
  };
  jobErrors: JobError[];
  lintFailures: LintFailuresSummary;
  reports: BugReport[];
}

interface CacheBucket {
  count: number;
  percent: number;
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

interface CacheStats {
  generatedAt: string;
  total: number;
  source: {
    hebrewbooks: CacheBucket;
    gemara: CacheBucket;
    commentaries: CacheBucket;
  };
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

async function fetchUsage(): Promise<UsagePayload> {
  const res = await fetch('/api/usage');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchCacheStats(): Promise<CacheStats> {
  const res = await fetch('/api/admin/cache-stats');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

interface SectionHeadingProps {
  title: string;
  hint?: string;
}
function SectionHeading(props: SectionHeadingProps): JSX.Element {
  return (
    <h2 style={{ 'font-size': '0.95rem', 'text-transform': 'uppercase', 'letter-spacing': '0.05em', color: '#999', 'margin-bottom': '0.5rem' }}>
      {props.title}
      <Show when={props.hint}>
        <span style={{ 'font-size': '0.75rem', color: '#888', 'margin-left': '0.5rem', 'text-transform': 'none', 'letter-spacing': 'normal' }}>
          {props.hint}
        </span>
      </Show>
    </h2>
  );
}

// ---- Collapsible top-level section ---------------------------------------
// Owns the <section> + clickable heading; remembers open/closed in
// localStorage (key usage.section.<id>) so a reader's layout survives reloads
// and the 30s auto-refresh. Wrapped blocks supply only their body — the title
// lives here.
function CollapsibleSection(props: { id: string; title: string; hint?: string; defaultOpen?: boolean; children: JSX.Element }): JSX.Element {
  const storageKey = `usage.section.${props.id}`;
  const initial = (() => {
    if (typeof window === 'undefined') return props.defaultOpen ?? false;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === '1') return true;
    if (saved === '0') return false;
    return props.defaultOpen ?? false;
  })();
  const [open, setOpen] = createSignal(initial);
  const toggle = () => {
    const next = !open();
    setOpen(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, next ? '1' : '0');
  };
  return (
    <section style={{ 'margin-bottom': '1.6rem' }}>
      <div onClick={toggle} style={{ cursor: 'pointer', display: 'flex', 'align-items': 'baseline', gap: '0.4rem', 'user-select': 'none' }}>
        <span style={{ color: '#bbb', 'font-size': '0.8rem', 'line-height': 1, width: '0.8rem', 'flex-shrink': 0 }}>{open() ? '▾' : '▸'}</span>
        <SectionHeading title={props.title} hint={props.hint} />
      </div>
      <Show when={open()}>
        <div style={{ 'padding-left': '1.2rem' }}>{props.children}</div>
      </Show>
    </section>
  );
}

const tableStyle = { width: '100%', 'border-collapse': 'collapse', 'font-size': '0.85rem' } as const;
const thStyle = { padding: '0.4rem 0.5rem' } as const;

function ProgressBar(props: { percent: number }): JSX.Element {
  const complete = () => props.percent >= 100;
  return (
    <div style={{ height: '8px', background: '#f0f0f0', 'border-radius': '3px', overflow: 'hidden' }}>
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

// ---- Source cache row (no versions) -------------------------------------
function SourceRow(props: { label: string; count: number; total: number; percent: number }): JSX.Element {
  const complete = () => props.percent >= 100;
  return (
    <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
      <td style={{ padding: '0.4rem 0.5rem' }}>{props.label}</td>
      <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>
        {fmtInt(props.count)} / {fmtInt(props.total)}
      </td>
      <td style={{ padding: '0.4rem 0.5rem', width: '38%' }}><ProgressBar percent={props.percent} /></td>
      <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', color: complete() ? '#2a8a42' : '#333', 'white-space': 'nowrap' }}>
        {props.percent.toFixed(1)}%<Show when={complete()}><span style={{ 'margin-left': '0.3rem' }}>✓</span></Show>
      </td>
    </tr>
  );
}

// Per-language slices of a row's `versions` map. The current version in lang L
// is fresh; superseded versions in L are stale. `:he` suffix = Hebrew bucket.
function langCount(versions: Record<string, number>, cv: string, he: boolean): number {
  return versions[he ? `${cv}:he` : cv] ?? 0;
}
function langStaleVersions(versions: Record<string, number>, cv: string, he: boolean): Array<[string, number]> {
  return Object.entries(versions)
    .filter(([v]) => {
      const isHe = v.endsWith(':he');
      return he ? (isHe && v !== `${cv}:he`) : (!isHe && v !== cv);
    })
    .sort(([a], [b]) => b.localeCompare(a));
}

// Small chip marking a Hebrew (:he) row.
function HeTag(): JSX.Element {
  return (
    <span style={{ 'font-size': '0.7rem', color: '#1d4ed8', 'margin-left': '0.4rem', background: '#eef2ff', padding: '0.05rem 0.4rem', 'border-radius': '3px', 'font-weight': 600 }}>
      {t('usage.heRow')}
    </span>
  );
}

// ---- Expandable anchor (mark) row with per-version breakdown -------------
// `he` renders the Hebrew (:he) slice of the same mark as its own row.
function AnchorRow(props: { row: MarkRow; total: number; he?: boolean }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const r = () => props.row;
  const he = () => props.he === true;
  const count = () => langCount(r().versions, r().cache_version, he());
  const percent = () => (props.total > 0 ? (count() / props.total) * 100 : 0);
  const otherVersions = () => langStaleVersions(r().versions, r().cache_version, he());
  const staleCount = () => otherVersions().reduce((s, [, n]) => s + n, 0);
  const complete = () => percent() >= 100;
  return (
    <>
      <tr style={{ 'border-bottom': '1px solid #f4f4f4', cursor: 'pointer' }} onClick={() => setOpen(!open())}>
        <td style={{ padding: '0.4rem 0.5rem' }}>
          <span style={{ color: '#bbb', 'margin-right': '0.4rem', display: 'inline-block', width: '0.7rem' }}>{open() ? '▾' : '▸'}</span>
          {r().label}
          <Show when={he()}><HeTag /></Show>
          <span style={{ color: '#888', 'font-size': '0.75rem', 'margin-left': '0.4rem' }}>({r().id} · v{r().cache_version}{he() ? ':he' : ''} · {r().source})</span>
          <Show when={staleCount() > 0}>
            <span style={{ 'font-size': '0.7rem', color: '#b58100', 'margin-left': '0.4rem', background: '#fff7e0', padding: '0.05rem 0.35rem', 'border-radius': '3px' }}>
              {t('usage.staleBadge', { count: fmtInt(staleCount()) })}
            </span>
          </Show>
        </td>
        <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>
          {fmtInt(count())} / {fmtInt(props.total)}
        </td>
        <td style={{ padding: '0.4rem 0.5rem', width: '38%' }}><ProgressBar percent={percent()} /></td>
        <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', color: complete() ? '#2a8a42' : '#333', 'white-space': 'nowrap' }}>
          {percent().toFixed(1)}%
        </td>
      </tr>
      <Show when={open()}>
        <tr style={{ background: '#fbfbfa' }}>
          <td colspan={4} style={{ padding: '0.3rem 0.5rem 0.6rem 1.6rem' }}>
            <div style={{ 'font-size': '0.78rem', color: '#666' }}>
              <div style={{ 'margin-bottom': '0.3rem' }}>
                <b>v{r().cache_version}{he() ? ':he' : ''}</b> {t('usage.version.current', { count: fmtInt(count()) })}
              </div>
              <Show when={otherVersions().length > 0} fallback={<span style={{ color: '#aaa' }}>{t('usage.version.noSuperseded')}</span>}>
                <div style={{ color: '#b58100', 'margin-bottom': '0.2rem' }}>{t('usage.version.supersededHeading')}</div>
                <For each={otherVersions()}>
                  {([v, n]) => (
                    <div style={{ 'font-family': 'monospace', 'padding-left': '0.5rem' }}>
                      mark:{r().id}:{v}: → {t('usage.version.entries', { count: fmtInt(n) })}
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </td>
        </tr>
      </Show>
    </>
  );
}

// ---- Pipeline coverage: source + anchors + local enrichments -------------
function PipelineSection(props: { stats: CacheStats }): JSX.Element {
  const s = () => props.stats.source;
  const total = () => props.stats.total;
  const localEnrich = () => props.stats.enrichments.filter((e) => e.scope === 'local');
  return (
    <>
      <table style={tableStyle}>
        <thead>
          <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
            <th style={thStyle}>{t('usage.col.stage')}</th>
            <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.cached')}</th>
            <th style={thStyle} />
            <th style={{ ...thStyle, 'text-align': 'right' }}>%</th>
          </tr>
        </thead>
        <tbody>
          <SourceRow label={t('usage.source.hebrewbooks')} count={s().hebrewbooks.count} total={total()} percent={s().hebrewbooks.percent} />
          <SourceRow label={t('usage.source.gemara')} count={s().gemara.count} total={total()} percent={s().gemara.percent} />
          <SourceRow label={t('usage.source.commentaries')} count={s().commentaries.count} total={total()} percent={s().commentaries.percent} />
        </tbody>
      </table>

      <div style={{ 'margin-top': '1rem' }}>
        <SectionHeading title={t('usage.anchors.title')} hint={t('usage.anchors.hint')} />
        <Show when={props.stats.marks.length > 0} fallback={<p style={{ color: '#888' }}>{t('usage.anchors.empty')}</p>}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
                <th style={thStyle}>{t('usage.col.anchor')}</th>
                <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.dafim')}</th>
                <th style={thStyle} />
                <th style={{ ...thStyle, 'text-align': 'right' }}>%</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.stats.marks}>{(m) => (
                <>
                  <AnchorRow row={m} total={total()} />
                  <Show when={m.heCount > 0}><AnchorRow row={m} total={total()} he /></Show>
                </>
              )}</For>
            </tbody>
          </table>
        </Show>
      </div>

      <div style={{ 'margin-top': '1rem' }}>
        <SectionHeading title={t('usage.localEnrich.title')} hint={t('usage.localEnrich.hint')} />
        <Show when={localEnrich().length > 0} fallback={<p style={{ color: '#888' }}>{t('usage.localEnrich.empty')}</p>}>
          <EnrichmentTable rows={localEnrich()} />
        </Show>
      </div>
    </>
  );
}

// One enrichment row, in a given language slice. `he` shows the Hebrew (:he)
// cache as its own line. The denominator ratio is only meaningful for English
// (instance counts are language-neutral), so it's omitted on the Hebrew row.
function EnrichRow(props: { e: EnrichmentRow; denom: number | null; he?: boolean }): JSX.Element {
  const e = () => props.e;
  const he = () => props.he === true;
  const count = () => langCount(e().versions, e().cache_version, he());
  const stale = () => langStaleVersions(e().versions, e().cache_version, he()).reduce((s, [, n]) => s + n, 0);
  return (
    <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
      <td style={{ padding: '0.4rem 0.5rem' }}>
        {e().label}
        <Show when={he()}><HeTag /></Show>
        <span style={{ color: '#888', 'font-size': '0.75rem', 'margin-left': '0.4rem' }}>({e().id} · v{e().cache_version}{he() ? ':he' : ''} · {e().source})</span>
      </td>
      <td style={{ padding: '0.4rem 0.5rem', 'font-family': 'monospace', color: '#555' }}>{e().target_mark}</td>
      <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>
        {fmtInt(count())}
        <Show when={!he() && props.denom != null && props.denom > 0}>
          <span style={{ color: '#999' }}> / {fmtInt(props.denom!)} ({((count() / props.denom!) * 100).toFixed(0)}%)</span>
        </Show>
      </td>
      <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', color: stale() ? '#b58100' : '#bbb' }}>
        {stale() ? fmtInt(stale()) : '—'}
      </td>
    </tr>
  );
}

function EnrichmentTable(props: { rows: EnrichmentRow[]; denominatorFor?: (e: EnrichmentRow) => number | null }): JSX.Element {
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
          <th style={thStyle}>{t('usage.col.enrichment')}</th>
          <th style={thStyle}>{t('usage.col.mark')}</th>
          <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.cached')}</th>
          <th style={{ ...thStyle, 'text-align': 'right' }}>{t('usage.col.stale')}</th>
        </tr>
      </thead>
      <tbody>
        <For each={props.rows}>
          {(e) => (
            <>
              <EnrichRow e={e} denom={props.denominatorFor?.(e) ?? null} />
              <Show when={e.heCount > 0}><EnrichRow e={e} denom={null} he /></Show>
            </>
          )}
        </For>
      </tbody>
    </table>
  );
}

// ---- Global repository ---------------------------------------------------
function RabbiCoverageRow(props: { label: string; filled: number | null; total: number; hint?: string }): JSX.Element {
  const tracked = () => props.filled !== null;
  const filled = () => props.filled ?? 0;
  const missing = () => Math.max(0, props.total - filled());
  const percent = () => (props.total > 0 ? (filled() / props.total) * 100 : 0);
  const complete = () => tracked() && percent() >= 100;
  return (
    <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
      <td style={{ padding: '0.35rem 0.5rem' }}>
        {props.label}
        <Show when={props.hint}>
          <span style={{ color: '#999', 'font-size': '0.72rem', 'margin-left': '0.4rem' }}>({props.hint})</span>
        </Show>
      </td>
      <td style={{ padding: '0.35rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>
        <Show when={tracked()} fallback={<span style={{ color: '#999' }}>—</span>}>
          <span style={{ color: '#333' }}>{fmtInt(filled())}</span>
          <span style={{ color: '#999' }}> / {fmtInt(props.total)}</span>
        </Show>
      </td>
      <td style={{ padding: '0.35rem 0.5rem', width: '30%' }}>
        <Show when={tracked()}><ProgressBar percent={percent()} /></Show>
      </td>
      <td style={{ padding: '0.35rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', color: complete() ? '#2a8a42' : '#333', 'white-space': 'nowrap' }}>
        <Show when={tracked()} fallback={<span style={{ color: '#999', 'font-size': '0.78rem' }}>{t('usage.notTracked')}</span>}>{percent().toFixed(1)}%</Show>
      </td>
      <td style={{ padding: '0.35rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', color: missing() === 0 ? '#999' : '#c33', 'font-size': '0.78rem', 'white-space': 'nowrap' }}>
        <Show when={tracked()} fallback={<span>—</span>}>{missing() === 0 ? '—' : t('usage.missing', { count: fmtInt(missing()) })}</Show>
      </td>
    </tr>
  );
}

function GlobalRepoSection(props: { stats: CacheStats; observedPlaces: number; observedConcepts: number }): JSX.Element {
  const r = () => props.stats.rabbis;
  const globalEnrich = () => props.stats.enrichments.filter((e) => e.scope === 'global');
  // Denominator for global enrichment coverage: rabbi.* against the dataset
  // size, places.* against distinct observed places (no gazetteer exists).
  const denom = (e: EnrichmentRow): number | null => {
    if (e.target_mark === 'rabbi') return r().totalRabbis;
    if (e.target_mark === 'places') return props.observedPlaces || null;
    return null;
  };
  return (
    <>
      <div style={{ 'font-size': '0.85rem' }}>
        <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '0 0 0.3rem' }}>{t('usage.rabbiCoverage.title')} <span style={{ color: '#999', 'font-weight': 'normal' }}>{t('usage.rabbiCoverage.sub', { count: fmtInt(r().totalRabbis) })}</span></h3>
        <table style={tableStyle}>
          <tbody>
            <RabbiCoverageRow label={t('usage.rabbi.bio')} filled={r().withBio} total={r().totalRabbis} />
            <RabbiCoverageRow label={t('usage.rabbi.sefariaBio')} filled={r().withSefariaBio} total={r().totalRabbis} hint={t('usage.rabbi.sefariaBio.hint')} />
            <RabbiCoverageRow label={t('usage.rabbi.wiki')} filled={r().withWiki} total={r().totalRabbis} hint={t('usage.rabbi.wiki.hint')} />
            <RabbiCoverageRow label={t('usage.rabbi.generation')} filled={r().withGeneration} total={r().totalRabbis} />
            <RabbiCoverageRow label={t('usage.rabbi.region')} filled={r().withRegion} total={r().totalRabbis} />
            <RabbiCoverageRow label={t('usage.rabbi.places')} filled={r().withPlaces} total={r().totalRabbis} />
            <RabbiCoverageRow label={t('usage.rabbi.chain')} filled={r().withHierarchyEdges} total={r().totalRabbis} hint={t('usage.rabbi.chain.hint')} />
            <RabbiCoverageRow label={t('usage.rabbi.family')} filled={r().withFamily} total={r().totalRabbis} hint={t('usage.rabbi.family.hint')} />
            <RabbiCoverageRow label={t('usage.rabbi.orientation')} filled={r().withOrientation} total={r().totalRabbis} hint={t('usage.rabbi.orientation.hint')} />
          </tbody>
        </table>
      </div>

      <div style={{ 'margin-top': '1.2rem' }}>
        <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '0 0 0.3rem' }}>{t('usage.globalEnrich.title')} <span style={{ color: '#999', 'font-weight': 'normal' }}>{t('usage.globalEnrich.sub')}</span></h3>
        <Show when={globalEnrich().length > 0} fallback={<p style={{ color: '#888' }}>{t('usage.globalEnrich.empty')}</p>}>
          <EnrichmentTable rows={globalEnrich()} denominatorFor={denom} />
        </Show>
        <Show when={props.observedPlaces === 0}>
          <p style={{ 'font-size': '0.78rem', color: '#b58100', 'margin-top': '0.4rem' }}>
            {t('usage.globalEnrich.noGazetteer')}
          </p>
        </Show>
        <p style={{ 'font-size': '0.78rem', color: '#777', 'margin-top': '0.4rem' }}>
          {t('usage.globalEnrich.concepts', { count: fmtInt(props.observedConcepts) })}
        </p>
      </div>
    </>
  );
}

// ---- Needs-enrichment backlog -------------------------------------------
function BacklogSection(props: { rabbis: UnknownSummary<UnknownRabbi>; places: UnknownSummary<ObservedPlace>; concepts: UnknownSummary<ObservedConcept> }): JSX.Element {
  const combinedTotal = () => props.rabbis.total + props.places.total + props.concepts.total;
  return (
    <>
    <p style={{ 'font-size': '0.82rem', color: '#555', margin: '0 0 0.7rem' }}>
      {t('usage.backlog.combined', { count: fmtInt(combinedTotal()) })}
    </p>
    <div style={{ display: 'flex', gap: '1.5rem', 'flex-wrap': 'wrap' }}>
        <div style={{ flex: '1 1 320px', 'min-width': '300px' }}>
          <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '0 0 0.3rem' }}>
            {t('usage.backlog.rabbis.title')} <span style={{ color: '#c33', 'font-weight': 'normal' }}>{t('usage.backlog.distinct', { count: fmtInt(props.rabbis.total) })}</span>
          </h3>
          <Show when={props.rabbis.sample.length > 0} fallback={<p style={{ color: '#888', 'font-size': '0.82rem' }}>{t('usage.backlog.rabbis.empty')}</p>}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
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
                        <Show when={u.nameHe && u.name}><span style={{ color: '#999', 'font-size': '0.75rem', 'margin-left': '0.4rem' }}>{u.name}</span></Show>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>{u.count}</td>
                      <td style={{ padding: '0.35rem 0.5rem', 'font-size': '0.75rem', color: '#888' }}>{u.dafs.slice(0, 3).join(', ')}{u.dafs.length > 3 ? '…' : ''}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </div>

        <div style={{ flex: '1 1 320px', 'min-width': '300px' }}>
          <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '0 0 0.3rem' }}>
            {t('usage.backlog.places.title')} <span style={{ color: '#888', 'font-weight': 'normal' }}>{t('usage.backlog.places.distinct', { count: fmtInt(props.places.total) })}</span>
          </h3>
          <Show when={props.places.sample.length > 0} fallback={<p style={{ color: '#888', 'font-size': '0.82rem' }}>{t('usage.backlog.places.empty')}</p>}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
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
                        <Show when={p.nameHe && p.name}><span style={{ color: '#999', 'font-size': '0.75rem', 'margin-left': '0.4rem' }}>{p.name}</span></Show>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', 'font-size': '0.78rem', color: '#777' }}>{p.kind ?? '—'}{p.region ? ` · ${p.region}` : ''}</td>
                      <td style={{ padding: '0.35rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>{p.count}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </div>

        <div style={{ flex: '1 1 320px', 'min-width': '300px' }}>
          <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '0 0 0.3rem' }}>
            {t('usage.backlog.concepts.title')} <span style={{ color: '#888', 'font-weight': 'normal' }}>{t('usage.backlog.concepts.distinct', { count: fmtInt(props.concepts.total) })}</span>
          </h3>
          <Show when={props.concepts.sample.length > 0} fallback={<p style={{ color: '#888', 'font-size': '0.82rem' }}>{t('usage.backlog.concepts.empty')}</p>}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
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
                        <Show when={c.termHe && c.term}><span style={{ color: '#999', 'font-size': '0.75rem', 'margin-left': '0.4rem' }}>{c.term}</span></Show>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', 'font-size': '0.78rem', color: '#777' }}>{c.category ?? '—'}</td>
                      <td style={{ padding: '0.35rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>{c.count}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </div>
    </div>
    </>
  );
}

// ---- Cost ----------------------------------------------------------------
function StatCard(props: { label: string; value: string; sub?: string; color?: string }): JSX.Element {
  return (
    <div style={{ flex: '1 1 140px', 'min-width': '130px', padding: '0.7rem 0.8rem', background: '#fcfcfa', border: '1px solid #eee', 'border-radius': '6px' }}>
      <div style={{ 'font-size': '0.7rem', 'text-transform': 'uppercase', 'letter-spacing': '0.04em', color: '#999' }}>{props.label}</div>
      <div style={{ 'font-size': '1.25rem', 'font-weight': 600, color: props.color ?? '#222', 'font-variant-numeric': 'tabular-nums' }}>{props.value}</div>
      <Show when={props.sub}><div style={{ 'font-size': '0.72rem', color: '#999' }}>{props.sub}</div></Show>
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
        <p style={{ color: a().configured ? '#c33' : '#888', 'font-size': '0.82rem', background: '#fafafa', padding: '0.5rem 0.7rem', 'border-radius': '4px', border: '1px solid #eee' }}>
          <Show when={!a().configured} fallback={<>{t('usage.activity.queryFailed', { error: a().error ?? '' })}</>}>
            {t('usage.activity.notConfigured.before')}<code>wrangler secret put CF_ZONE_ANALYTICS_TOKEN</code>{t('usage.activity.notConfigured.after', { error: a().error ?? '' })}
          </Show>
        </p>
      }
    >
      <div style={{ display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.8rem' }}>
        <StatCard label={t('usage.activity.today')} value={fmtInt(totals()?.day.requests ?? 0)} sub={t('usage.activity.visits', { count: fmtInt(totals()?.day.visits ?? 0) })} />
        <StatCard label={t('usage.activity.week')} value={fmtInt(totals()?.week.requests ?? 0)} sub={t('usage.activity.visits', { count: fmtInt(totals()?.week.visits ?? 0) })} />
        <StatCard label={t('usage.activity.month')} value={fmtInt(totals()?.month.requests ?? 0)} color="#0066CC" sub={t('usage.activity.visits', { count: fmtInt(totals()?.month.visits ?? 0) })} />
      </div>

      <Show when={byDay().length > 0}>
        <div style={{ 'margin-bottom': '0.9rem' }}>
          <div style={{ 'font-size': '0.75rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.04em', 'margin-bottom': '0.3rem' }}>{t('usage.activity.trend')}</div>
          <div style={{ display: 'flex', 'align-items': 'flex-end', gap: '2px', height: '60px' }}>
            <For each={byDay()}>
              {(d) => (
                <div
                  title={`${d.date}: ${fmtInt(d.requests)}`}
                  style={{ flex: '1 1 0', background: '#4b7bec', 'border-radius': '2px 2px 0 0', height: `${Math.max(2, (d.requests / maxDay()) * 100)}%`, 'min-width': '3px' }}
                />
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={byCountry().length > 0}>
        <div style={{ 'font-size': '0.75rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.04em', 'margin-bottom': '0.2rem' }}>{t('usage.activity.fromWhere')}</div>
        <table style={tableStyle}>
          <tbody>
            <For each={byCountry()}>
              {(c) => (
                <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                  <td style={{ padding: '0.3rem 0.5rem' }}>{c.country || t('usage.activity.unknownCountry')}</td>
                  <td style={{ padding: '0.3rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', color: '#555' }}>{fmtInt(c.requests)}</td>
                  <td style={{ padding: '0.3rem 0.5rem', width: '40%' }}>
                    <div style={{ height: '8px', background: '#f0f0f0', 'border-radius': '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${countryTotal() > 0 ? Math.min(100, (c.requests / countryTotal()) * 100) : 0}%`, height: '100%', background: '#4b7bec' }} />
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

function CostSection(props: { cost: UsagePayload['cost']; stats: CacheStats | undefined }): JSX.Element {
  const aigw = () => props.cost.aiGateway;
  const self = () => props.cost.selfTracked;

  // Rough projection to warm the rest of the shas. Uses the most-covered mark
  // as a proxy for "dafim run through the pipeline" and priced self-tracked
  // spend per such daf. Only meaningful when there's priced spend.
  const projection = () => {
    const s = self();
    const st = props.stats;
    if (!s || !st || s.totals.costUsd <= 0) return null;
    const processed = Math.max(0, ...st.marks.map((m) => m.count));
    if (processed <= 0) return null;
    const perDaf = s.totals.costUsd / processed;
    const remaining = Math.max(0, st.total - processed);
    return { perDaf, remaining, projected: perDaf * remaining };
  };

  return (
    <>
      {/* AI Gateway (authoritative) */}
      <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '0.2rem 0 0.4rem' }}>{t('usage.aigw.title')} <span style={{ color: '#999', 'font-weight': 'normal' }}>{t('usage.aigw.sub')}</span></h3>
      <Show
        when={aigw().ok}
        fallback={
          <p style={{ color: aigw().configured ? '#c33' : '#888', 'font-size': '0.82rem', background: '#fafafa', padding: '0.5rem 0.7rem', 'border-radius': '4px', border: '1px solid #eee' }}>
            <Show when={!aigw().configured} fallback={<>{t('usage.aigw.queryFailed', { error: aigw().error ?? '' })}</>}>
              {t('usage.aigw.notConfigured.before')}<code>wrangler secret put CF_ANALYTICS_TOKEN</code>{t('usage.aigw.notConfigured.after', { error: aigw().error ?? '' })}
            </Show>
          </p>
        }
      >
        <div style={{ display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.6rem' }}>
          <StatCard label={t('usage.stat.totalCost')} value={fmtUsd(aigw().costUsd)} color="#2a8a42" />
          <StatCard label={t('usage.stat.requests')} value={fmtInt(aigw().requests ?? 0)} />
          <StatCard label={t('usage.stat.tokensIn')} value={fmtTokens(aigw().tokensIn)} />
          <StatCard label={t('usage.stat.tokensOut')} value={fmtTokens(aigw().tokensOut)} />
        </div>
        <Show when={(aigw().byModel?.length ?? 0) > 0}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ 'text-align': 'left', 'border-bottom': '1px solid #eee', color: '#666' }}>
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
                    <td style={{ padding: '0.4rem 0.5rem', 'font-family': 'monospace', 'font-size': '0.8rem' }}>{m.model}</td>
                    <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>{fmtInt(m.requests)}</td>
                    <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>{fmtTokens(m.tokensIn + m.tokensOut)}</td>
                    <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>{fmtUsd(m.costUsd)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </Show>

      {/* Self-tracked (per-mark/enrichment attribution) */}
      <h3 style={{ 'font-size': '0.8rem', color: '#777', margin: '1.1rem 0 0.4rem' }}>
        {t('usage.selfTracked.title')} <span style={{ color: '#999', 'font-weight': 'normal' }}>{self()?.fromDate ? t('usage.selfTracked.subSince', { date: self()!.fromDate ?? '' }) : t('usage.selfTracked.sub')}</span>
      </h3>
      <Show when={self()} fallback={<p style={{ color: '#888', 'font-size': '0.82rem' }}>{t('usage.selfTracked.empty')}</p>}>
        {(s) => (
          <>
            <div style={{ display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.6rem' }}>
              <StatCard label={t('usage.stat.costPriced')} value={fmtUsd(s().totals.costUsd)} color="#2a8a42" sub={t('usage.stat.pricedCalls', { count: fmtInt(s().totals.pricedCalls) })} />
              <StatCard label={t('usage.stat.unpricedCalls')} value={fmtInt(s().totals.unpricedCalls)} sub={t('usage.stat.unpricedCalls.sub')} />
              <StatCard label={t('usage.stat.llmCalls')} value={fmtInt(s().totals.calls)} sub={t('usage.stat.errored', { count: fmtInt(s().totals.errors) })} />
              <StatCard label={t('usage.stat.tokens')} value={fmtTokens(s().totals.tokensIn + s().totals.tokensOut)} sub={t('usage.stat.tokensInOut', { in: fmtTokens(s().totals.tokensIn), out: fmtTokens(s().totals.tokensOut) })} />
            </div>
            <Show when={projection()}>
              {(p) => (
                <p style={{ 'font-size': '0.82rem', color: '#555', background: '#f5f8ff', padding: '0.5rem 0.7rem', 'border-radius': '4px', border: '1px solid #e0e8f5', 'margin-bottom': '0.6rem' }}>
                  {t('usage.projection.before', { perDaf: fmtUsd(p().perDaf), remaining: fmtInt(p().remaining) })}<b>{fmtUsd(p().projected)}</b>{t('usage.projection.after')}
                  <span style={{ color: '#999' }}> {t('usage.projection.note')}</span>
                </p>
              )}
            </Show>
            <Show when={Object.keys(s().byMark).length > 0 || Object.keys(s().byEnrichment).length > 0}>
              <CostBreakdown title={t('usage.byMark')} buckets={s().byMark} />
              <CostBreakdown title={t('usage.byEnrichment')} buckets={s().byEnrichment} />
            </Show>
          </>
        )}
      </Show>
    </>
  );
}

function CostBreakdown(props: { title: string; buckets: Record<string, UsageBucket> }): JSX.Element {
  const rows = () => Object.entries(props.buckets).sort(([, a], [, b]) => b.costUsd - a.costUsd || b.calls - a.calls);
  return (
    <Show when={rows().length > 0}>
      <div style={{ 'margin-top': '0.5rem' }}>
        <div style={{ 'font-size': '0.75rem', color: '#999', 'text-transform': 'uppercase', 'letter-spacing': '0.04em', 'margin-bottom': '0.2rem' }}>{props.title}</div>
        <table style={tableStyle}>
          <tbody>
            <For each={rows()}>
              {([id, b]) => (
                <tr style={{ 'border-bottom': '1px solid #f4f4f4' }}>
                  <td style={{ padding: '0.3rem 0.5rem', 'font-family': 'monospace', 'font-size': '0.8rem' }}>{id}</td>
                  <td style={{ padding: '0.3rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', color: '#888' }}>{t('usage.callsCount', { count: fmtInt(b.calls) })}</td>
                  <td style={{ padding: '0.3rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', color: '#888' }}>{fmtTokens(b.tokensIn + b.tokensOut)}</td>
                  <td style={{ padding: '0.3rem 0.5rem', 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' }}>{b.pricedCalls ? fmtUsd(b.costUsd) : <span style={{ color: '#bbb' }}>{t('usage.unpriced')}</span>}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}

// ---- Latency -------------------------------------------------------------
function LatencyTable(props: { title: string; hint?: string; rows: Array<[string, PerEndpoint]> }): JSX.Element {
  return (
    <section style={{ 'margin-bottom': '1.6rem' }}>
      <SectionHeading title={props.title} hint={props.hint} />
      <Show when={props.rows.length > 0} fallback={<p style={{ color: '#888' }}>{t('usage.noDataYet')}</p>}>
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
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>{row.count ? `${Math.round(row.cacheHitRate * 100)}%` : '—'}</td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>{row.count ? fmtMs(row.p50Ms) : '—'}</td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right' }}>{row.count ? fmtMs(row.p95Ms) : '—'}</td>
                  <td style={{ padding: '0.4rem 0.5rem', 'text-align': 'right', color: row.errorCount ? '#c33' : '#888' }}>{row.errorCount}</td>
                  <td style={{ padding: '0.4rem 0.5rem', 'font-size': '0.75rem', color: '#888' }}>
                    {Object.entries(row.errorsByKind).map(([k, n]) => `${k}:${n}`).join(', ')}
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

export function UsagePage(): JSX.Element {
  const [data, { refetch }] = createResource(fetchUsage);
  const [cacheStats, { refetch: refetchCache }] = createResource(fetchCacheStats);
  const interval = setInterval(() => { void refetch(); void refetchCache(); }, 30000);
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => clearInterval(interval));

  return (
    <main class="page-shell" style={{ '--page-max': '960px', 'font-family': 'system-ui, -apple-system, sans-serif', color: '#222' }}>
      <header class="responsive-row" style={{ 'margin-bottom': '1.2rem' }}>
        <h1 style={{ margin: 0, 'font-size': '1.4rem' }}>{t('usage.title')}</h1>
        <a href="#daf" style={{ color: '#666', 'font-size': '0.85rem', 'text-decoration': 'none' }}>{t('usage.backToDaf')}</a>
        <button
          onClick={() => { void refetch(); void refetchCache(); }}
          style={{ 'margin-left': 'auto', padding: '0.3rem 0.7rem', border: '1px solid #ddd', 'border-radius': '4px', background: '#fff', cursor: 'pointer', 'font-size': '0.8rem' }}
        >
          {t('usage.refresh')}
        </button>
      </header>

      <Show when={data()}>
        {(d) => (
          <>
            <CollapsibleSection id="activity" title={t('usage.activity.title')} hint={t('usage.activity.hint')} defaultOpen>
              <ActivitySection activity={d().activity} />
            </CollapsibleSection>
            <CollapsibleSection id="cost" title={t('usage.cost.title')} hint={t('usage.cost.hint')} defaultOpen>
              <CostSection cost={d().cost} stats={cacheStats()} />
            </CollapsibleSection>
          </>
        )}
      </Show>

      <Show when={cacheStats()}>
        {(cs) => (
          <>
            <CollapsibleSection id="pipeline" title={t('usage.pipeline.title')} hint={t('usage.pipeline.hint', { count: fmtInt(cs().total) })}>
              <PipelineSection stats={cs()} />
            </CollapsibleSection>
            <CollapsibleSection id="globalRepo" title={t('usage.globalRepo.title')} hint={t('usage.globalRepo.hint')}>
              <GlobalRepoSection stats={cs()} observedPlaces={data()?.unknowns.places.total ?? 0} observedConcepts={data()?.unknowns.concepts.total ?? 0} />
            </CollapsibleSection>
          </>
        )}
      </Show>

      <Show when={data()}>
        {(d) => (
          <CollapsibleSection id="backlog" title={t('usage.backlog.title')} hint={t('usage.backlog.hint')}>
            <BacklogSection rabbis={d().unknowns.rabbis} places={d().unknowns.places} concepts={d().unknowns.concepts} />
          </CollapsibleSection>
        )}
      </Show>

      <Show when={data.error}>
        <p style={{ color: '#c33' }}>{t('usage.loadFailed', { error: String(data.error) })}</p>
      </Show>

      <Show when={data()}>
        {(d) => (
          <>
            <CollapsibleSection id="telemetry" title={t('usage.group.telemetry')} hint={t('usage.group.telemetry.hint')}>
            <LatencyTable
              title={t('usage.latency.byEndpoint', { count: d().telemetry.totalCount })}
              rows={Object.entries(d().telemetry.perEndpoint).sort(([a], [b]) => a.localeCompare(b))}
            />
            <LatencyTable title={t('usage.latency.byMark')} hint={t('usage.latency.byMark.hint')} rows={Object.entries(d().telemetry.perMark).sort(([a], [b]) => a.localeCompare(b))} />
            <LatencyTable title={t('usage.latency.byEnrichment')} hint={t('usage.latency.byEnrichment.hint')} rows={Object.entries(d().telemetry.perEnrichment).sort(([a], [b]) => a.localeCompare(b))} />

            <section style={{ 'margin-bottom': '1.6rem' }}>
              <SectionHeading title={t('usage.recentErrors.title')} hint={t('usage.recentErrors.hint')} />
              <Show when={d().telemetry.recentErrors.length > 0} fallback={<p style={{ color: '#888' }}>{t('usage.none')}</p>}>
                <ul style={{ 'list-style': 'none', padding: 0, margin: 0, 'font-size': '0.8rem' }}>
                  <For each={d().telemetry.recentErrors}>
                    {(e) => (
                      <li style={{ padding: '0.3rem 0', 'border-bottom': '1px solid #f4f4f4', display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap' }}>
                        <span style={{ color: '#999', 'white-space': 'nowrap' }}>{fmtTime(e.ts)}</span>
                        <span style={{ 'font-family': 'monospace' }}>{e.endpoint}</span>
                        <Show when={e.mark_id}><span style={{ 'font-family': 'monospace', color: '#555' }}>mark={e.mark_id}</span></Show>
                        <Show when={e.enrichment_id}><span style={{ 'font-family': 'monospace', color: '#555' }}>enrich={e.enrichment_id}</span></Show>
                        <Show when={e.tractate || e.page}><span style={{ color: '#666' }}>{e.tractate} {e.page}</span></Show>
                        <span style={{ color: '#c33' }}>{e.error_kind ?? t('usage.errorKind.other')}</span>
                        <Show when={e.model}><span style={{ color: '#888', 'font-size': '0.75rem' }}>({e.model})</span></Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>
            </CollapsibleSection>

            <CollapsibleSection id="errors" title={t('usage.group.errors')} hint={t('usage.group.errors.hint')}>
            <section style={{ 'margin-bottom': '1.6rem' }}>
              <SectionHeading title={t('usage.jobErrors.title', { count: d().jobErrors.length })} hint={t('usage.jobErrors.hint')} />
              <Show when={d().jobErrors.length > 0} fallback={<p style={{ color: '#888' }}>{t('usage.none')}</p>}>
                <ul style={{ 'list-style': 'none', padding: 0, margin: 0, 'font-size': '0.8rem' }}>
                  <For each={d().jobErrors}>
                    {(e) => (
                      <li style={{ padding: '0.4rem 0', 'border-bottom': '1px solid #f4f4f4' }}>
                        <div style={{ display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.15rem' }}>
                          <span style={{ color: '#999', 'white-space': 'nowrap' }}>{fmtTime(e.ts)}</span>
                          <span style={{ 'font-family': 'monospace', color: '#555' }}>{e.kind}{e.id ? `=${e.id}` : ''}</span>
                          <span style={{ color: '#666' }}>{e.tractate} {e.page}</span>
                        </div>
                        <div style={{ color: '#c33', 'font-family': 'monospace', 'font-size': '0.74rem', 'white-space': 'pre-wrap' }}>{e.error}</div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>

            <section style={{ 'margin-bottom': '1.6rem' }}>
              <SectionHeading title={t('usage.lintFailures.title', { count: d().lintFailures.recent.length })} hint={t('usage.lintFailures.hint')} />
              <Show when={Object.keys(d().lintFailures.counts).length > 0}>
                <div style={{ display: 'flex', gap: '0.4rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.5rem' }}>
                  <For each={Object.entries(d().lintFailures.counts).sort((a, b) => b[1] - a[1])}>
                    {([id, n]) => (
                      <span style={{ 'font-size': '0.74rem', 'font-family': 'monospace', padding: '0.15rem 0.45rem', background: '#fef3c7', border: '1px solid #fde68a', 'border-radius': '999px', color: '#92400e' }}>
                        {id} · {n}
                      </span>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={d().lintFailures.recent.length > 0} fallback={<p style={{ color: '#888' }}>{t('usage.none')}</p>}>
                <ul style={{ 'list-style': 'none', padding: 0, margin: 0, 'font-size': '0.8rem' }}>
                  <For each={d().lintFailures.recent}>
                    {(f) => (
                      <li style={{ padding: '0.4rem 0', 'border-bottom': '1px solid #f4f4f4' }}>
                        <div style={{ display: 'flex', gap: '0.6rem', 'flex-wrap': 'wrap', 'margin-bottom': '0.15rem' }}>
                          <span style={{ color: '#999', 'white-space': 'nowrap' }}>{fmtTime(f.at)}</span>
                          <span style={{ 'font-family': 'monospace', color: '#555' }}>{f.enrichmentId}</span>
                          <span style={{ color: '#666' }}>{f.tractate} {f.page}{f.lang === 'he' ? ' · he' : ''}</span>
                          <span style={{ color: '#92400e' }}>×{f.attempts}</span>
                        </div>
                        <div style={{ color: '#a16207', 'font-family': 'monospace', 'font-size': '0.74rem', 'white-space': 'pre-wrap' }}>{f.issues.join(' · ')}</div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>

            <section>
              <SectionHeading title={t('usage.bugReports.title', { count: d().reports.length })} />
              <Show when={d().reports.length > 0} fallback={<p style={{ color: '#888' }}>{t('usage.bugReports.empty')}</p>}>
                <ul style={{ 'list-style': 'none', padding: 0, margin: 0 }}>
                  <For each={d().reports}>
                    {(r) => (
                      <li style={{ padding: '0.7rem 0.8rem', margin: '0 0 0.5rem', background: '#fcfcfa', border: '1px solid #eee', 'border-radius': '4px' }}>
                        <div style={{ 'font-size': '0.75rem', color: '#888', 'margin-bottom': '0.3rem' }}>
                          {fmtTime(r.ts)} · <b>{r.tractate} {r.page}</b>
                          <Show when={r.country}><span> · {r.country}</span></Show>
                        </div>
                        <div style={{ 'white-space': 'pre-wrap', 'font-size': '0.88rem', color: '#222', 'line-height': 1.45 }}>{r.description}</div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>
            </CollapsibleSection>
          </>
        )}
      </Show>
    </main>
  );
}
