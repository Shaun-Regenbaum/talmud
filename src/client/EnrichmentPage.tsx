/**
 * Enrichment lab — tabs for the three content types the daf produces:
 *   Argument  — sections + rabbis + dispute structure
 *   Halacha   — practical topics with rulings (MT / SA / Rema + modern)
 *   Aggadata  — narrative stories (+ parallels + historical context)
 *
 * Each tab loads its own stage-1 endpoint, then lets the user click
 * "enrich" buttons attached to each section/topic/story. Enrichment
 * results attach inline under the item they enriched.
 */
import { createResource, createSignal, For, Show, type JSX, type Resource } from 'solid-js';
import { TRACTATE_OPTIONS } from '../lib/sefref';
import { ARGUMENT_FLOW_CSS } from './ArgumentFlowSidebar';
import { RelationsTab } from './RelationsTab';

// ---- types ---------------------------------------------------------------

interface ArgumentSkeleton {
  summary: string;
  sections: Array<{
    title: string;
    summary: string;
    excerpt: string;
    rabbiNames: string[];
  }>;
}

interface BiblicalRef { ref: string; hebrewRef?: string; hebrewQuote?: string; }
interface DifficultyRating { score: 1 | 2 | 3 | 4 | 5; reason: string; }
interface EnrichedRabbi {
  name: string; nameHe?: string; period?: string; location?: string;
  role?: string; opinionStart?: string; opinionEnd?: string;
  generation?: string;
  agreesWith?: string[]; disagreesWith?: string[];
}
interface EnrichedArgumentSection {
  title: string; summary: string; excerpt?: string;
  references?: BiblicalRef[]; parallels?: string[]; difficulty?: DifficultyRating;
  rabbis: EnrichedRabbi[];
}
interface EnrichedArgumentAnalysis {
  summary: string; difficulty?: DifficultyRating;
  sections: EnrichedArgumentSection[];
  _strategy?: string; _elapsed_ms?: number;
}

interface HalachaRuling { ref: string; summary: string; }
interface ModernAuthority { source: string; ref?: string; summary: string; }
interface RishonNote { rishon: string; note: string; ref?: string; }
interface HalachaTopic {
  topic: string; topicHe?: string; excerpt?: string;
  rulings: { mishnehTorah?: HalachaRuling; shulchanAruch?: HalachaRuling; rema?: HalachaRuling };
  modernAuthorities?: ModernAuthority[];
  rishonimNotes?: RishonNote[];
}
interface HalachaResult { topics: HalachaTopic[]; _cached?: boolean; }

interface HistoricalContext { era: string; context: string; }
interface AggadataStory {
  title: string; titleHe?: string; summary: string; excerpt: string; theme?: string;
  parallels?: string[]; historicalContext?: HistoricalContext;
}
interface AggadataResult { stories: AggadataStory[]; _cached?: boolean; }

type Tab = 'argument' | 'halacha' | 'aggadata' | 'relations';

// ---- fetchers -------------------------------------------------------------

async function fetchSkeleton(tractate: string, page: string): Promise<ArgumentSkeleton> {
  const res = await fetch(`/api/analyze/${encodeURIComponent(tractate)}/${page}?skeleton_only=1`);
  if (!res.ok) throw new Error(`skeleton: HTTP ${res.status}`);
  return res.json();
}

async function fetchHalacha(tractate: string, page: string): Promise<HalachaResult> {
  const res = await fetch(`/api/halacha/${encodeURIComponent(tractate)}/${page}`);
  if (!res.ok) throw new Error(`halacha: HTTP ${res.status}`);
  return res.json();
}

async function fetchAggadata(tractate: string, page: string): Promise<AggadataResult> {
  const res = await fetch(`/api/aggadata/${encodeURIComponent(tractate)}/${page}`);
  if (!res.ok) throw new Error(`aggadata: HTTP ${res.status}`);
  return res.json();
}

async function enrichArgument(tractate: string, page: string, strategy: string): Promise<EnrichedArgumentAnalysis> {
  const res = await fetch(
    `/api/enrich/${encodeURIComponent(tractate)}/${page}?strategy=${strategy}`,
    { method: 'POST' },
  );
  const body = await res.json().catch(() => null) as (EnrichedArgumentAnalysis & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  if (!body) throw new Error('empty');
  return body;
}

type HalachaEnrichStrategy = 'modern-authorities' | 'rishonim-condensed';
async function enrichHalacha(tractate: string, page: string, strategy: HalachaEnrichStrategy): Promise<HalachaResult> {
  const res = await fetch(
    `/api/enrich-halacha/${encodeURIComponent(tractate)}/${page}?strategy=${strategy}`,
    { method: 'POST' },
  );
  const body = await res.json().catch(() => null) as (HalachaResult & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  if (!body) throw new Error('empty');
  return body;
}

async function enrichAggadata(tractate: string, page: string, strategy: 'parallels' | 'historical-context'): Promise<AggadataResult> {
  const res = await fetch(
    `/api/enrich-aggadata/${encodeURIComponent(tractate)}/${page}?strategy=${strategy}`,
    { method: 'POST' },
  );
  const body = await res.json().catch(() => null) as (AggadataResult & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  if (!body) throw new Error('empty');
  return body;
}

// ---- component ------------------------------------------------------------

export function EnrichmentPage(): JSX.Element {
  const [tractate, setTractate] = createSignal('Berakhot');
  const [page, setPage] = createSignal('5a');
  const [tab, setTab] = createSignal<Tab>('argument');
  const [loadKey, setLoadKey] = createSignal(0);
  const dafKey = () => `${tractate()}|${page()}|${loadKey()}`;

  const [skeleton] = createResource(dafKey, async (): Promise<ArgumentSkeleton | null> => {
    if (loadKey() === 0) return null;
    return fetchSkeleton(tractate(), page()).catch(() => null);
  });
  const [halacha, { mutate: mutateHalacha }] = createResource(dafKey, async (): Promise<HalachaResult | null> => {
    if (loadKey() === 0) return null;
    return fetchHalacha(tractate(), page()).catch(() => null);
  });
  const [aggadata, { mutate: mutateAggadata }] = createResource(dafKey, async (): Promise<AggadataResult | null> => {
    if (loadKey() === 0) return null;
    return fetchAggadata(tractate(), page()).catch(() => null);
  });

  const [argumentEnrichments, setArgumentEnrichments] = createSignal<Partial<Record<string, EnrichedArgumentAnalysis>>>({});
  const [running, setRunning] = createSignal<Partial<Record<string, boolean>>>({});
  const [errors, setErrors] = createSignal<Partial<Record<string, string>>>({});

  const handleLoad = () => {
    setArgumentEnrichments({});
    setRunning({});
    setErrors({});
    setLoadKey(loadKey() + 1);
  };

  const runArg = async (strategy: string) => {
    const key = `arg:${strategy}`;
    setRunning(r => ({ ...r, [key]: true }));
    setErrors(e => ({ ...e, [key]: undefined }));
    try {
      const result = await enrichArgument(tractate(), page(), strategy);
      setArgumentEnrichments(prev => ({ ...prev, [strategy]: result }));
    } catch (err) {
      setErrors(e => ({ ...e, [key]: String(err) }));
    } finally {
      setRunning(r => ({ ...r, [key]: false }));
    }
  };

  const runHalachaEnrich = async (strategy: HalachaEnrichStrategy) => {
    const key = `halacha:${strategy}`;
    setRunning(r => ({ ...r, [key]: true }));
    setErrors(e => ({ ...e, [key]: undefined }));
    try {
      const result = await enrichHalacha(tractate(), page(), strategy);
      // Merge the enriched fields (modernAuthorities OR rishonimNotes) back onto the
      // current halacha topics by topic name, preserving any fields from the
      // other strategy that may already be there.
      const prev = halacha();
      if (prev) {
        const byTopic = new Map<string, HalachaTopic>();
        for (const t of result.topics) byTopic.set(t.topic.toLowerCase(), t);
        mutateHalacha({
          ...prev,
          topics: prev.topics.map(t => {
            const hit = byTopic.get(t.topic.toLowerCase());
            if (!hit) return t;
            return {
              ...t,
              ...(hit.modernAuthorities !== undefined ? { modernAuthorities: hit.modernAuthorities } : {}),
              ...(hit.rishonimNotes !== undefined ? { rishonimNotes: hit.rishonimNotes } : {}),
            };
          }),
        });
      } else {
        mutateHalacha(result);
      }
    } catch (err) {
      setErrors(e => ({ ...e, [key]: String(err) }));
    } finally {
      setRunning(r => ({ ...r, [key]: false }));
    }
  };

  const runAggEnrich = async (strategy: 'parallels' | 'historical-context') => {
    const key = `aggadata:${strategy}`;
    setRunning(r => ({ ...r, [key]: true }));
    setErrors(e => ({ ...e, [key]: undefined }));
    try {
      const result = await enrichAggadata(tractate(), page(), strategy);
      const prev = aggadata();
      if (prev) {
        const byTitle = new Map<string, AggadataStory>();
        for (const st of result.stories) byTitle.set(st.title.toLowerCase(), st);
        mutateAggadata({
          ...prev,
          stories: prev.stories.map(st => {
            const hit = byTitle.get(st.title.toLowerCase());
            if (!hit) return st;
            return {
              ...st,
              ...(hit.parallels ? { parallels: hit.parallels } : {}),
              ...(hit.historicalContext ? { historicalContext: hit.historicalContext } : {}),
            };
          }),
        });
      } else {
        mutateAggadata(result);
      }
    } catch (err) {
      setErrors(e => ({ ...e, [key]: String(err) }));
    } finally {
      setRunning(r => ({ ...r, [key]: false }));
    }
  };

  // Merge all argument strategy outputs so each section card can show
  // whatever fields any strategy has populated.
  const mergedArgument = () => {
    const e = argumentEnrichments();
    const order = ['rich-rabbi', 'per-section', 'hybrid', 'baseline', 'references', 'parallels', 'difficulty'];
    const base = order.map(k => e[k]).find(Boolean);
    if (!base) return null;
    const bySec = new Map<string, EnrichedArgumentSection>();
    for (const sec of base.sections) bySec.set(sec.title.toLowerCase(), { ...sec });
    for (const strat of order) {
      const result = e[strat];
      if (!result) continue;
      for (const sec of result.sections) {
        const existing = bySec.get(sec.title.toLowerCase());
        if (!existing) continue;
        if (sec.rabbis && sec.rabbis.length > 0 && (existing.rabbis.length === 0 || strat === 'rich-rabbi')) {
          existing.rabbis = sec.rabbis;
        }
        if (sec.references) existing.references = sec.references;
        if (sec.parallels) existing.parallels = sec.parallels;
        if (sec.difficulty) existing.difficulty = sec.difficulty;
      }
    }
    const overallDifficulty = order.map(k => e[k]?.difficulty).find(Boolean);
    return {
      summary: base.summary,
      difficulty: overallDifficulty,
      sections: base.sections.map(s => bySec.get(s.title.toLowerCase())!).filter(Boolean),
    };
  };

  return (
    <div class="enrichment-page">
      <style>{PAGE_CSS}</style>
      <style>{ARGUMENT_FLOW_CSS}</style>

      <h1>Enrichment Lab</h1>
      <p class="lead">
        Each tab shows the daf's stage-1 output for one content type. Click enrich buttons
        to layer extra fields onto each section/topic/story.
      </p>

      <section class="panel controls">
        <label>Tractate</label>
        <select value={tractate()} onChange={(e) => setTractate(e.currentTarget.value)}>
          <For each={TRACTATE_OPTIONS}>{(t) => <option value={t.value}>{t.value} · {t.label}</option>}</For>
        </select>
        <label>Daf</label>
        <input type="text" value={page()} onInput={(e) => setPage(e.currentTarget.value)} style="width: 5rem;" placeholder="5a" />
        <button class="primary" onClick={handleLoad}>Load</button>
      </section>

      <Show when={loadKey() > 0}>
        <div class="tabs">
          <button class="tab" classList={{ 'tab-active': tab() === 'argument' }} onClick={() => setTab('argument')}>
            Argument
            <Show when={skeleton()}><span class="tab-count">{skeleton()!.sections.length}</span></Show>
          </button>
          <button class="tab" classList={{ 'tab-active': tab() === 'halacha' }} onClick={() => setTab('halacha')}>
            Halacha
            <Show when={halacha()}><span class="tab-count">{halacha()!.topics.length}</span></Show>
          </button>
          <button class="tab" classList={{ 'tab-active': tab() === 'aggadata' }} onClick={() => setTab('aggadata')}>
            Aggadata
            <Show when={aggadata()}><span class="tab-count">{aggadata()!.stories.length}</span></Show>
          </button>
          <button class="tab" classList={{ 'tab-active': tab() === 'relations' }} onClick={() => setTab('relations')}>
            Relations
          </button>
        </div>

        <Show when={tab() === 'argument'}>
          <ArgumentTab
            skeleton={skeleton}
            merged={mergedArgument()}
            running={running()}
            errors={errors()}
            onRun={runArg}
          />
        </Show>
        <Show when={tab() === 'halacha'}>
          <HalachaTab halacha={halacha} running={running()} errors={errors()} onEnrich={runHalachaEnrich} />
        </Show>
        <Show when={tab() === 'aggadata'}>
          <AggadataTab aggadata={aggadata} running={running()} errors={errors()} onEnrich={runAggEnrich} />
        </Show>
        <Show when={tab() === 'relations'}>
          <RelationsTab tractate={tractate()} page={page()} loadKey={loadKey()} />
        </Show>
      </Show>

      <Show when={loadKey() === 0}>
        <section class="panel empty">Pick a tractate + daf and click <b>Load</b>.</section>
      </Show>
    </div>
  );
}

// ---- tabs -----------------------------------------------------------------

function ArgumentTab(props: {
  skeleton: Resource<ArgumentSkeleton | null>;
  merged: { summary: string; difficulty?: DifficultyRating; sections: EnrichedArgumentSection[] } | null;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onRun: (strategy: string) => void;
}): JSX.Element {
  const STRATEGIES = [
    { id: 'rich-rabbi', label: 'Rich rabbi',  desc: 'Rabbi identity + role + opinionStart/End + agreesWith/disagreesWith.' },
    { id: 'references', label: 'References',  desc: 'Biblical verses per section.' },
    { id: 'parallels',  label: 'Parallels',   desc: 'Parallel sugyot in other masechtot.' },
    { id: 'difficulty', label: 'Difficulty',  desc: '1-5 per section + overall.' },
  ] as const;

  return (
    <>
      <section class="panel enrich-bar">
        <span class="enrich-label">Enrichments</span>
        <For each={STRATEGIES}>{(s) => {
          const runKey = `arg:${s.id}`;
          return (
            <button class="enrich-btn" disabled={!!props.running[runKey]} onClick={() => props.onRun(s.id)} title={s.desc}>
              {props.running[runKey] ? `${s.label}…` : `+ ${s.label}`}
              <Show when={props.errors[runKey]}><span class="enrich-btn-err">err</span></Show>
            </button>
          );
        }}</For>
      </section>

      <Show when={props.skeleton.loading}><p class="loading">Loading skeleton…</p></Show>
      <Show when={!props.merged && props.skeleton()}>
        {(s) => (
          <section class="panel">
            <p class="daf-summary">{s().summary}</p>
            <For each={s().sections}>{(sec, i) => (
              <div class="card">
                <div class="card-head">
                  <span class="card-num">§{i() + 1}</span>
                  <span class="card-title">{sec.title}</span>
                </div>
                <Show when={sec.rabbiNames.length > 0}>
                  <div class="card-who">{sec.rabbiNames.join(', ')}</div>
                </Show>
                <p class="card-summary">{sec.summary}</p>
              </div>
            )}</For>
          </section>
        )}
      </Show>

      <Show when={props.merged}>
        {(m) => (
          <section class="panel">
            <p class="daf-summary">{m().summary}</p>
            <For each={m().sections}>{(sec, i) => <ArgumentSectionCard sec={sec} idx={i()} />}</For>
          </section>
        )}
      </Show>
    </>
  );
}

function ArgumentSectionCard(props: { sec: EnrichedArgumentSection; idx: number }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const sec = () => props.sec;
  const hasSectionDetail = () => !!(
    (sec().references && sec().references!.length > 0)
    || (sec().parallels && sec().parallels!.length > 0)
    || sec().difficulty
  );
  return (
    <div class="card">
      <div class="card-head">
        <span class="card-num">§{props.idx + 1}</span>
        <span class="card-title">{sec().title}</span>
      </div>
      <Show when={sec().rabbis && sec().rabbis.length > 0}>
        <div class="card-who">{sec().rabbis.map(r => r.name).join(', ')}</div>
      </Show>
      <p class="card-summary">{sec().summary}</p>

      <Show when={sec().rabbis && sec().rabbis.length > 0 && sec().rabbis.some(r => r.role || r.opinionStart)}>
        <div class="sub-cards">
          <For each={sec().rabbis}>{(r) => <RabbiSubcard rabbi={r} />}</For>
        </div>
      </Show>

      <Show when={hasSectionDetail()}>
        <div class="section-more">
          <button class="more-btn" onClick={() => setOpen(!open())}>{open() ? '−' : '…'}</button>
        </div>
        <Show when={open()}>
          <div class="detail">
            <Show when={sec().references && sec().references!.length > 0}>
              <div class="d-row"><span class="d-label">Pesukim</span>
                <div class="d-body d-wrap">
                  <For each={sec().references!}>{(ref) => <span class="d-ref" title={ref.hebrewQuote || ref.ref}>{ref.hebrewRef || ref.ref}</span>}</For>
                </div>
              </div>
            </Show>
            <Show when={sec().parallels && sec().parallels!.length > 0}>
              <div class="d-row"><span class="d-label">See also</span>
                <div class="d-body d-wrap">
                  <For each={sec().parallels!}>{(p) => <span class="d-parallel">{p}</span>}</For>
                </div>
              </div>
            </Show>
            <Show when={sec().difficulty}>
              <div class="d-row"><span class="d-label">Difficulty</span>
                <div class="d-body">
                  <span class="d-stars">{'★'.repeat(sec().difficulty!.score)}{'☆'.repeat(5 - sec().difficulty!.score)}</span>
                  <span class="d-diff-reason"> {sec().difficulty!.reason}</span>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function RabbiSubcard(props: { rabbi: EnrichedRabbi }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const r = () => props.rabbi;
  const hasDetail = () => !!(
    r().opinionStart || r().opinionEnd
    || (r().agreesWith && r().agreesWith!.length > 0)
    || (r().disagreesWith && r().disagreesWith!.length > 0)
    || r().location
  );
  return (
    <div class="sub-card">
      <div class="sub-head">
        <span class="sub-name">{r().name}</span>
        <Show when={r().nameHe}><span class="sub-he"> · {r().nameHe}</span></Show>
        <Show when={r().period}><span class="sub-era">{r().period!.replace(/,.*$/, '')}</span></Show>
      </div>
      <Show when={r().role}><div class="sub-role">{r().role}</div></Show>
      <Show when={hasDetail()}>
        <button class="sub-toggle" onClick={() => setOpen(!open())}>{open() ? '−' : '…'}</button>
        <Show when={open()}>
          <div class="sub-detail">
            <Show when={r().opinionStart || r().opinionEnd}>
              <div class="sub-span">
                <Show when={r().opinionStart}><span>{r().opinionStart}</span></Show>
                <Show when={r().opinionStart && r().opinionEnd}><span class="sub-span-gap">&nbsp;…&nbsp;</span></Show>
                <Show when={r().opinionEnd}><span>{r().opinionEnd}</span></Show>
              </div>
            </Show>
            <Show when={r().agreesWith && r().agreesWith!.length > 0}>
              <div class="sub-rel"><span class="plus">+</span><span class="prep"> with </span>{r().agreesWith!.join(', ')}</div>
            </Show>
            <Show when={r().disagreesWith && r().disagreesWith!.length > 0}>
              <div class="sub-rel"><span class="minus">−</span><span class="prep"> vs </span>{r().disagreesWith!.join(', ')}</div>
            </Show>
            <Show when={r().location}><div class="sub-loc">{r().location}</div></Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function HalachaTab(props: {
  halacha: Resource<HalachaResult | null>;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onEnrich: (strategy: HalachaEnrichStrategy) => void;
}): JSX.Element {
  return (
    <>
      <section class="panel enrich-bar">
        <span class="enrich-label">Enrichments</span>
        <button class="enrich-btn"
          disabled={!!props.running['halacha:modern-authorities'] || !props.halacha()}
          onClick={() => props.onEnrich('modern-authorities')}
          title="Mishna Berurah, Peninei Halakhah, Aruch HaShulchan, Igrot Moshe, etc. per topic.">
          {props.running['halacha:modern-authorities'] ? 'Modern authorities…' : '+ Modern authorities'}
          <Show when={props.errors['halacha:modern-authorities']}><span class="enrich-btn-err">err</span></Show>
        </button>
        <button class="enrich-btn"
          disabled={!!props.running['halacha:rishonim-condensed'] || !props.halacha()}
          onClick={() => props.onEnrich('rishonim-condensed')}
          title="For each topic, distill each Rishon's position (Rashba, Ritva, Ramban, Meiri, Rosh, Maharsha) to one sentence.">
          {props.running['halacha:rishonim-condensed'] ? 'Rishonim condensed…' : '+ Rishonim condensed'}
          <Show when={props.errors['halacha:rishonim-condensed']}><span class="enrich-btn-err">err</span></Show>
        </button>
      </section>
      <Show when={props.halacha.loading}><p class="loading">Loading halacha…</p></Show>
      <Show when={props.halacha.error}><p class="err-msg">{String(props.halacha.error)}</p></Show>
      <Show when={props.halacha() && props.halacha()!.topics.length === 0}>
        <section class="panel empty">No halacha topics on this daf.</section>
      </Show>
      <Show when={props.halacha() && props.halacha()!.topics.length > 0}>
        <section class="panel">
          <For each={props.halacha()!.topics}>{(t, i) => <HalachaCard topic={t} idx={i()} />}</For>
        </section>
      </Show>
    </>
  );
}

function HalachaCard(props: { topic: HalachaTopic; idx: number }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const t = () => props.topic;
  const rulings = () => {
    const out: Array<{ code: string; ref: string; summary: string }> = [];
    if (t().rulings.mishnehTorah) out.push({ code: 'Rambam MT', ref: t().rulings.mishnehTorah!.ref, summary: t().rulings.mishnehTorah!.summary });
    if (t().rulings.shulchanAruch) out.push({ code: 'Shulchan Aruch', ref: t().rulings.shulchanAruch!.ref, summary: t().rulings.shulchanAruch!.summary });
    if (t().rulings.rema) out.push({ code: 'Rema', ref: t().rulings.rema!.ref, summary: t().rulings.rema!.summary });
    return out;
  };
  const hasMore = () => !!(t().modernAuthorities && t().modernAuthorities!.length > 0)
    || !!(t().rishonimNotes && t().rishonimNotes!.length > 0)
    || !!t().excerpt;
  return (
    <div class="card">
      <div class="card-head">
        <span class="card-num">§{props.idx + 1}</span>
        <span class="card-title">
          {t().topic}
          <Show when={t().topicHe}><span class="card-title-he"> · {t().topicHe}</span></Show>
        </span>
      </div>
      <Show when={rulings().length > 0}>
        <ul class="ruling-list">
          <For each={rulings()}>{(rul) => (
            <li class="ruling">
              <span class="ruling-code">{rul.code}</span>
              <span class="ruling-ref">{rul.ref}</span>
              <div class="ruling-summary">{rul.summary}</div>
            </li>
          )}</For>
        </ul>
      </Show>
      <Show when={hasMore()}>
        <div class="section-more">
          <button class="more-btn" onClick={() => setOpen(!open())}>{open() ? '−' : '…'}</button>
        </div>
        <Show when={open()}>
          <div class="detail">
            <Show when={t().excerpt}>
              <div class="d-row"><span class="d-label">Source</span><div class="d-body"><span class="d-excerpt">{t().excerpt}</span></div></div>
            </Show>
            <Show when={t().rishonimNotes && t().rishonimNotes!.length > 0}>
              <div class="d-row"><span class="d-label">Rishonim</span>
                <div class="d-body">
                  <For each={t().rishonimNotes!}>{(n) => (
                    <div class="modern-row">
                      <span class="modern-src">{n.rishon}</span>
                      <span class="modern-text"> — {n.note}</span>
                    </div>
                  )}</For>
                </div>
              </div>
            </Show>
            <Show when={t().modernAuthorities && t().modernAuthorities!.length > 0}>
              <div class="d-row"><span class="d-label">Modern</span>
                <div class="d-body">
                  <For each={t().modernAuthorities!}>{(a) => (
                    <div class="modern-row">
                      <span class="modern-src">{a.source}</span>
                      <span class="modern-text"> — {a.summary}</span>
                    </div>
                  )}</For>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function AggadataTab(props: {
  aggadata: Resource<AggadataResult | null>;
  running: Partial<Record<string, boolean>>;
  errors: Partial<Record<string, string>>;
  onEnrich: (strategy: 'parallels' | 'historical-context') => void;
}): JSX.Element {
  return (
    <>
      <section class="panel enrich-bar">
        <span class="enrich-label">Enrichments</span>
        <button class="enrich-btn" disabled={!!props.running['aggadata:parallels'] || !props.aggadata()} onClick={() => props.onEnrich('parallels')}>
          {props.running['aggadata:parallels'] ? 'Parallels…' : '+ Parallels'}
          <Show when={props.errors['aggadata:parallels']}><span class="enrich-btn-err">err</span></Show>
        </button>
        <button class="enrich-btn" disabled={!!props.running['aggadata:historical-context'] || !props.aggadata()} onClick={() => props.onEnrich('historical-context')}>
          {props.running['aggadata:historical-context'] ? 'Historical context…' : '+ Historical context'}
          <Show when={props.errors['aggadata:historical-context']}><span class="enrich-btn-err">err</span></Show>
        </button>
      </section>
      <Show when={props.aggadata.loading}><p class="loading">Loading aggadata…</p></Show>
      <Show when={props.aggadata.error}><p class="err-msg">{String(props.aggadata.error)}</p></Show>
      <Show when={props.aggadata() && props.aggadata()!.stories.length === 0}>
        <section class="panel empty">No aggadic stories on this daf.</section>
      </Show>
      <Show when={props.aggadata() && props.aggadata()!.stories.length > 0}>
        <section class="panel">
          <For each={props.aggadata()!.stories}>{(s, i) => <AggadataCard story={s} idx={i()} />}</For>
        </section>
      </Show>
    </>
  );
}

function AggadataCard(props: { story: AggadataStory; idx: number }): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const s = () => props.story;
  const hasMore = () => !!(s().excerpt || (s().parallels && s().parallels!.length > 0) || s().historicalContext);
  return (
    <div class="card">
      <div class="card-head">
        <span class="card-num">§{props.idx + 1}</span>
        <span class="card-title">
          {s().title}
          <Show when={s().titleHe}><span class="card-title-he"> · {s().titleHe}</span></Show>
        </span>
        <Show when={s().theme}><span class="theme-tag">{s().theme}</span></Show>
      </div>
      <p class="card-summary">{s().summary}</p>
      <Show when={hasMore()}>
        <div class="section-more">
          <button class="more-btn" onClick={() => setOpen(!open())}>{open() ? '−' : '…'}</button>
        </div>
        <Show when={open()}>
          <div class="detail">
            <Show when={s().excerpt}>
              <div class="d-row"><span class="d-label">Source</span><div class="d-body"><span class="d-excerpt">{s().excerpt}</span></div></div>
            </Show>
            <Show when={s().parallels && s().parallels!.length > 0}>
              <div class="d-row"><span class="d-label">Parallels</span>
                <div class="d-body d-wrap">
                  <For each={s().parallels!}>{(p) => <span class="d-parallel">{p}</span>}</For>
                </div>
              </div>
            </Show>
            <Show when={s().historicalContext}>
              <div class="d-row"><span class="d-label">Historical</span>
                <div class="d-body">
                  <div class="hist-era">{s().historicalContext!.era}</div>
                  <div class="hist-ctx">{s().historicalContext!.context}</div>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}

// ---- styles ---------------------------------------------------------------

const PAGE_CSS = `
.enrichment-page { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 1rem; color: #1e293b; }
.enrichment-page h1 { margin: 0 0 0.3rem; font-size: 22px; }
.enrichment-page .lead { color: #475569; margin: 0 0 1rem; font-size: 13px; }
.enrichment-page .panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1rem; }
.enrichment-page .empty { text-align: center; color: #94a3b8; padding: 2rem; }
.enrichment-page .controls { display: flex; gap: 0.5rem; align-items: center; padding: 0.6rem 0.8rem; flex-wrap: wrap; }
.enrichment-page .controls label { font-weight: 500; font-size: 12px; color: #475569; margin-right: 0.2rem; }
.enrichment-page select, .enrichment-page input[type="text"] { padding: 0.3rem 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
.enrichment-page button { padding: 0.3rem 0.7rem; border: 1px solid #cbd5e1; background: white; border-radius: 4px; cursor: pointer; font-size: 13px; color: #1e293b; }
.enrichment-page button:hover:not(:disabled) { background: #f1f5f9; }
.enrichment-page button:disabled { opacity: 0.5; cursor: not-allowed; }
.enrichment-page button.primary { background: #1e293b; color: white; border-color: #0f172a; }
.enrichment-page button.primary:hover:not(:disabled) { background: #0f172a; }

.tabs { display: flex; gap: 0.25rem; margin-bottom: 0.5rem; border-bottom: 1px solid #e5e7eb; }
.tab { border: none; background: transparent; padding: 0.5rem 1rem; font-size: 13.5px; color: #64748b; border-bottom: 2px solid transparent; border-radius: 0; margin-bottom: -1px; cursor: pointer; display: flex; align-items: center; gap: 0.35rem; }
.tab:hover { color: #1e293b; background: transparent; }
.tab-active { color: #1e293b; font-weight: 600; border-bottom-color: #1e293b; }
.tab-count { background: #e2e8f0; color: #475569; font-size: 10.5px; padding: 1px 6px; border-radius: 10px; font-weight: 500; }

.enrich-bar { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; padding: 0.5rem 0.8rem; background: #f8fafc; }
.enrich-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-right: 0.3rem; }
.enrich-btn { background: white; border: 1px solid #cbd5e1; font-size: 12px; padding: 0.25rem 0.6rem; }
.enrich-btn-err { color: #b91c1c; margin-left: 0.35rem; font-size: 10px; }

.daf-summary { font-size: 13.5px; color: #475569; margin: 0 0 0.75rem; line-height: 1.5; font-style: italic; }

.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.6rem 0.75rem; margin-bottom: 0.5rem; position: relative; }
.card-head { display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.25rem; flex-wrap: wrap; }
.card-num { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #94a3b8; }
.card-title { font-weight: 600; font-size: 14px; color: #1e293b; flex: 1; }
.card-title-he { font-family: Arial Hebrew, David, serif; color: #64748b; font-weight: 500; }
.card-who { font-size: 12px; color: #64748b; margin-bottom: 0.35rem; }
.card-summary { font-size: 13px; color: #334155; margin: 0 0 0.25rem; line-height: 1.5; }

.theme-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; background: #e2e8f0; color: #475569; padding: 1px 7px; border-radius: 10px; font-weight: 500; }

.ruling-list { list-style: none; padding: 0; margin: 0.35rem 0 0; display: flex; flex-direction: column; gap: 0.3rem; }
.ruling { padding: 0.3rem 0.4rem; background: #fafafa; border-radius: 3px; font-size: 12px; }
.ruling-code { font-weight: 600; color: #1e293b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; margin-right: 0.4rem; }
.ruling-ref { font-family: ui-monospace, Menlo, monospace; color: #475569; font-size: 11.5px; }
.ruling-summary { color: #475569; font-size: 12px; margin-top: 0.15rem; line-height: 1.45; }

.sub-cards { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.5rem; }
.sub-card { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 3px; padding: 0.35rem 0.55rem; position: relative; }
.sub-head { display: flex; align-items: baseline; gap: 0.3rem; flex-wrap: wrap; padding-right: 1.5rem; }
.sub-name { font-weight: 600; color: #1e293b; font-size: 12.5px; }
.sub-he { font-family: Arial Hebrew, David, serif; color: #64748b; font-weight: 500; }
.sub-era { margin-left: auto; font-size: 10px; color: #94a3b8; }
.sub-role { font-size: 11.5px; color: #475569; margin-top: 0.15rem; line-height: 1.4; padding-right: 1.5rem; }
.sub-toggle { position: absolute; bottom: 0.15rem; right: 0.35rem; border: none; background: transparent; color: #cbd5e1; font-size: 13px; cursor: pointer; padding: 0.05rem 0.3rem; line-height: 1; }
.sub-toggle:hover { color: #475569; }
.sub-detail { margin-top: 0.35rem; padding-top: 0.3rem; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 0.25rem; }
.sub-span { font-family: Arial Hebrew, David, serif; direction: rtl; text-align: right; font-size: 12.5px; color: #475569; padding: 0.15rem 0.35rem; background: #fff; border-radius: 2px; }
.sub-span-gap { color: #94a3b8; font-family: system-ui; }
.sub-rel { font-size: 11px; color: #334155; }
.sub-loc { font-size: 10.5px; color: #94a3b8; font-style: italic; }

.section-more { display: flex; justify-content: center; margin-top: 0.1rem; }
.enrichment-page .more-btn { border: none; background: transparent; color: #cbd5e1; font-size: 16px; padding: 0.15rem 0.6rem; line-height: 1; letter-spacing: 2px; border-radius: 0; }
.enrichment-page .more-btn:hover { color: #64748b; background: transparent; }
.enrichment-page .sub-toggle { border: none; background: transparent; border-radius: 0; }
.enrichment-page .sub-toggle:hover { background: transparent; }

.detail { padding: 0.5rem 0.25rem 0; display: flex; flex-direction: column; gap: 0.4rem; }
.d-row { display: flex; gap: 0.5rem; align-items: baseline; }
.d-label { font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; width: 68px; flex-shrink: 0; }
.d-body { flex: 1; font-size: 11.5px; color: #334155; display: flex; flex-direction: column; gap: 0.2rem; }
.d-wrap { flex-direction: row; flex-wrap: wrap; gap: 0.35rem; }
.d-ref { font-family: Arial Hebrew, David, serif; color: #64748b; cursor: help; }
.d-parallel { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: #64748b; background: #f1f5f9; padding: 1px 5px; border-radius: 2px; }
.d-stars { color: #64748b; margin-right: 0.35rem; letter-spacing: 0.5px; }
.d-diff-reason { color: #475569; font-style: italic; }
.d-excerpt { font-family: Arial Hebrew, David, serif; direction: rtl; text-align: right; font-size: 13px; color: #475569; padding: 0.2rem 0.4rem; background: #f8fafc; border-radius: 2px; }

.modern-row { font-size: 11.5px; line-height: 1.4; }
.modern-src { font-weight: 600; color: #1e293b; }
.modern-text { color: #475569; }

.hist-era { font-size: 10.5px; font-weight: 600; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.15rem; }
.hist-ctx { font-size: 11.5px; color: #334155; line-height: 1.45; }

.plus { color: #16a34a; font-weight: 700; }
.minus { color: #b91c1c; font-weight: 700; }
.prep { color: #94a3b8; font-style: italic; }

.loading, .err-msg { font-size: 13px; padding: 0.5rem 1rem; }
.err-msg { color: #b91c1c; background: #fee2e2; border-radius: 4px; }
`;

export default EnrichmentPage;
