/**
 * Tree (chain of tradition) tab in EnrichmentPage. Daf-scoped.
 *
 * Visualization: era-band layout. Vertical strips on the left labelled
 * ZUGIM / TANNAIM / AMORAIM / SAVORAIM contain the rabbis on this daf
 * placed in their fine-grained generation column. Edges between nodes are
 * drawn as an SVG overlay; the user toggles which edge types render.
 *
 * First-pass: rabbis as disconnected nodes in their era band.
 *
 * Enrichments (each a separate toggle):
 *   - Argues     (red) — pulled from /api/enrich-era-arguments, kind=argues
 *   - Supports   (green) — same endpoint, kind=supports
 *   - Teacher/student (gray solid arrow) — derived: each rabbi's
 *     primaryTeacher (from /api/admin/rabbi-enriched/:slug) PLUS any
 *     teacher/student edges where both endpoints are on this daf
 *     (from /api/admin/rabbi-graph).
 */
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import { EnrichmentToggle, ENRICHMENT_TOGGLE_CSS } from './EnrichmentToggle';

interface DafContextRabbi {
  slug: string | null;
  name: string;
  nameHe?: string;
  generation?: string;
}
interface DafContextResult { rabbis: DafContextRabbi[] }

interface RabbiEdge { slug: string | null; name: string; weight: number | null; source: string }
interface UnifiedRabbi {
  slug: string;
  canonical: { en: string; he: string };
  generation: string | null;
  primaryTeacher: string | null;
  primaryStudent: string | null;
}
interface RabbiGraphNode {
  slug: string;
  canonical: string;
  canonicalHe: string;
  generation: string | null;
  teachers: Array<{ slug: string | null; name: string; weight: number | null; source: string }>;
  students: Array<{ slug: string | null; name: string; weight: number | null; source: string }>;
}
interface RabbiGraph { nodes: Record<string, RabbiGraphNode> }

interface EraArgPair {
  a: string;
  b: string;
  kind: 'argues' | 'supports';
  section?: string;
  startSegIdx?: number;
  endSegIdx?: number;
  evidence?: string;
}
interface EraArgNetResult { pairs: EraArgPair[]; generatedAt?: string }

/** Toggle ids the user can flip in the UI. */
type Toggle = 'argues' | 'supports' | 'teacher';
/** Edge kinds rendered as separate lane bands. The teacher toggle produces
 *  two kinds: edges ending at a teacher render as 'teacher' (point to an
 *  older sage), edges ending at a student render as 'student' (point to a
 *  younger sage). Each kind gets its own lane band so they never overlap. */
type EdgeKind = 'argues' | 'supports' | 'teacher' | 'student';

/** Major era bands rendered as vertical strips, ordered earliest to latest. */
const ERA_BANDS = [
  { id: 'zugim',    label: 'ZUGIM',    color: '#c4b5fd' },
  { id: 'tannaim',  label: 'TANNAIM',  color: '#3b82f6' },
  { id: 'amoraim',  label: 'AMORAIM',  color: '#fbbf24' },
  { id: 'savoraim', label: 'SAVORAIM', color: '#94a3b8' },
] as const;

type BandId = (typeof ERA_BANDS)[number]['id'];

/** Map a generation slug from rabbi-places.json (e.g. "tanna-4", "amora-ey-3",
 *  "amora-bavel-1", "tanna-pre", "savora", "biblical", "zugot") to a band.
 *  Tolerates several formats so the diagram works against either the
 *  fine-grained slugs or the rabbi-graph "T4"/"A2" shorthand. */
function bandFor(generation: string | null | undefined): BandId | null {
  if (!generation) return null;
  const g = generation.toLowerCase();
  if (g.startsWith('zugot') || g === 'biblical' || g === 'tanna-pre' || g.startsWith('tp')) return 'zugim';
  if (g.startsWith('tanna') || /^t\d/.test(g)) return 'tannaim';
  if (g.startsWith('amora') || /^a\d/.test(g)) return 'amoraim';
  if (g.startsWith('savor') || g.startsWith('gaon') || /^s\d?/.test(g)) return 'savoraim';
  return null;
}

/** Compact column key WITHIN a band (so e.g. amora-ey-3 and amora-bavel-3
 *  share the same column). Returns the numeric generation suffix. */
function columnKey(generation: string | null | undefined): string {
  if (!generation) return 'unknown';
  const m = generation.match(/(\d+)\s*$/);
  if (m) return m[1];
  if (generation === 'tanna-pre') return 'pre';
  if (generation === 'savora') return 'sav';
  if (generation === 'gaon') return 'gaon';
  if (generation === 'biblical' || generation === 'zugot') return 'biblical';
  return generation;
}

function columnLabel(key: string, band: BandId): string {
  if (key === 'unknown' || key === 'pre' || key === 'sav' || key === 'gaon' || key === 'biblical') return '';
  if (band === 'tannaim') return `T${key}`;
  if (band === 'amoraim') return `A${key}`;
  if (band === 'savoraim') return `S${key}`;
  return key;
}

/** Trim the slug for compact display: drop "rabbi-"/"rav-" prefix, replace
 *  hyphens with thin spaces. Falls back to the canonical name when present. */
function compactName(name: string, slug: string): string {
  if (name && !/^rav[-\s]|^rabbi[-\s]/i.test(name)) return name;
  return slug.replace(/^(rav|rabbi)-/, '').replace(/-/g, ' ');
}

export function MesorahTab(props: { tractate: string; page: string; loadKey: number; refreshNonce?: number; onReloadSkeleton?: () => void }): JSX.Element {
  const dafKey = () => `${props.tractate}|${props.page}|${props.loadKey}|${props.refreshNonce ?? 0}`;

  // ---- Rabbis on this daf (first-pass) ------------------------------------
  const [ctx] = createResource(dafKey, async (): Promise<DafContextResult | null> => {
    if (props.loadKey === 0) return null;
    const refresh = (props.refreshNonce ?? 0) > 0 ? '?refresh=1' : '';
    const res = await fetch(`/api/daf-context/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}${refresh}`);
    if (!res.ok) return null;
    return res.json();
  });
  const dafSlugs = (): string[] => (ctx()?.rabbis ?? []).map((r) => r.slug).filter((s): s is string => !!s);

  // ---- Toggle state -------------------------------------------------------
  const [included, setIncluded] = createSignal<Set<Toggle>>(new Set());
  const [running, setRunning] = createSignal<Partial<Record<Toggle, boolean>>>({});
  const [errors, setErrors] = createSignal<Partial<Record<Toggle, string>>>({});

  // ---- Source caches ------------------------------------------------------
  const [unified, setUnified] = createSignal<Record<string, UnifiedRabbi | null>>({});
  const [graph, setGraph] = createSignal<RabbiGraph | null>(null);
  const [argNet, setArgNet] = createSignal<EraArgNetResult | null>(null);
  const [argNetCached, setArgNetCached] = createSignal(false);
  const [teacherCached, setTeacherCached] = createSignal(false);

  // Probe caches once per daf load. Default-on for any toggle whose data is
  // already cached. The effect tracks dafKey() and ctx() (via dafSlugs); it
  // does NOT track its own setters' targets, so no recursion. Each new
  // dafKey resets state and re-probes once ctx is loaded.
  let probedKey = '';
  createEffect(async () => {
    const key = dafKey();
    if (key === probedKey) return;
    probedKey = key;

    setIncluded(new Set<Toggle>());
    setErrors({});
    setUnified({});
    setGraph(null);
    setArgNet(null);
    setArgNetCached(false);
    setTeacherCached(false);
    if (props.loadKey === 0) return;

    const slugs = dafSlugs();
    if (slugs.length === 0) return;

    const [unifiedRecords, g, argNetCachedRes] = await Promise.all([
      Promise.all(slugs.map(async (slug) => {
        try {
          const r = await fetch(`/api/admin/rabbi-enriched/${encodeURIComponent(slug)}`);
          if (!r.ok) return [slug, null] as const;
          const body = await r.json() as { record?: UnifiedRabbi } | null;
          return [slug, body?.record ?? null] as const;
        } catch { return [slug, null] as const; }
      })),
      (async (): Promise<RabbiGraph | null> => {
        try {
          const r = await fetch('/api/admin/rabbi-graph');
          return r.ok ? (await r.json() as RabbiGraph) : null;
        } catch { return null; }
      })(),
      (async (): Promise<EraArgNetResult | null> => {
        try {
          const r = await fetch(`/api/enrich-era-arguments/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}?cached_only=1`);
          return r.ok ? (await r.json() as EraArgNetResult) : null;
        } catch { return null; }
      })(),
    ]);

    const unifiedMap: Record<string, UnifiedRabbi | null> = {};
    let anyUnified = false;
    for (const [slug, rec] of unifiedRecords) {
      unifiedMap[slug] = rec;
      if (rec) anyUnified = true;
    }
    setUnified(unifiedMap);
    setGraph(g);
    const teacherIsCached = anyUnified || !!g;
    setTeacherCached(teacherIsCached);

    if (argNetCachedRes) {
      setArgNet(argNetCachedRes);
      setArgNetCached(true);
    }

    const next = new Set<Toggle>();
    if (teacherIsCached) next.add('teacher');
    if (argNetCachedRes) {
      // Default both argues and supports on if the network is cached. They
      // toggle independently afterwards.
      next.add('argues');
      next.add('supports');
    }
    setIncluded(next);
  });

  // ---- Toggle handlers ----------------------------------------------------
  const ensureUnified = async (): Promise<void> => {
    const slugs = dafSlugs();
    const need = slugs.filter((s) => unified()[s] === undefined);
    if (need.length === 0) return;
    const fetched = await Promise.all(need.map(async (slug) => {
      try {
        const r = await fetch(`/api/admin/rabbi-enriched/${encodeURIComponent(slug)}`);
        if (!r.ok) return [slug, null] as const;
        const body = await r.json() as { record?: UnifiedRabbi } | null;
        return [slug, body?.record ?? null] as const;
      } catch { return [slug, null] as const; }
    }));
    setUnified((u) => {
      const next = { ...u };
      for (const [slug, rec] of fetched) next[slug] = rec;
      return next;
    });
  };

  const ensureGraph = async (): Promise<void> => {
    if (graph()) return;
    const r = await fetch('/api/admin/rabbi-graph');
    if (!r.ok) throw new Error(`graph: HTTP ${r.status}`);
    const body = await r.json() as RabbiGraph;
    setGraph(body);
  };

  const ensureArgNet = async (refresh = false): Promise<void> => {
    if (argNet() && !refresh) return;
    const url = `/api/enrich-era-arguments/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}${refresh ? '?refresh=1' : ''}`;
    const r = await fetch(url, { method: 'POST' });
    const body = await r.json().catch(() => null) as (EraArgNetResult & { error?: string }) | null;
    if (!r.ok || !body || body.error) {
      throw new Error(body?.error ?? `HTTP ${r.status}`);
    }
    setArgNet(body);
    setArgNetCached(true);
  };

  const toggle = async (id: Toggle) => {
    if (included().has(id)) {
      setIncluded((s) => { const n = new Set(s); n.delete(id); return n; });
      return;
    }
    setRunning((r) => ({ ...r, [id]: true }));
    setErrors((e) => ({ ...e, [id]: undefined }));
    try {
      if (id === 'teacher') {
        await Promise.all([ensureUnified(), ensureGraph().catch(() => undefined)]);
        setTeacherCached(true);
      } else if (id === 'argues' || id === 'supports') {
        await ensureArgNet(false);
      }
      setIncluded((s) => new Set(s).add(id));
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: String(err) }));
    } finally {
      setRunning((r) => ({ ...r, [id]: false }));
    }
  };

  const refreshArgNet = async () => {
    setRunning((r) => ({ ...r, argues: true, supports: true }));
    setErrors((e) => ({ ...e, argues: undefined, supports: undefined }));
    try {
      await ensureArgNet(true);
      setIncluded((s) => new Set(s).add('argues').add('supports'));
    } catch (err) {
      setErrors((e) => ({ ...e, argues: String(err), supports: String(err) }));
    } finally {
      setRunning((r) => ({ ...r, argues: false, supports: false }));
    }
  };

  // ---- Diagram model ------------------------------------------------------
  // For each band, derive the rabbis that fall into it (by their fine
  // generation). Unknown-band rabbis go into a trailing "Unknown" band.
  interface DiagramNode { slug: string; label: string; labelHe: string; generation: string | null; band: BandId | 'unknown' }

  /** Resolve a slug's generation by walking through every available source.
   *  daf-context is the cheapest but often missing this field; unified and
   *  rabbi-graph fill in the gaps. */
  const generationFor = (slug: string, ctxGen?: string | null): string | null => {
    if (ctxGen) return ctxGen;
    const u = unified()[slug];
    if (u?.generation) return u.generation;
    const gn = graph()?.nodes[slug];
    if (gn?.generation) return gn.generation;
    return null;
  };

  const nodes = createMemo<DiagramNode[]>(() => {
    const out: DiagramNode[] = [];
    const seen = new Set<string>();
    for (const r of ctx()?.rabbis ?? []) {
      if (!r.slug || seen.has(r.slug)) continue;
      seen.add(r.slug);
      const gen = generationFor(r.slug, r.generation);
      out.push({
        slug: r.slug,
        label: r.name,
        labelHe: r.nameHe ?? '',
        generation: gen,
        band: bandFor(gen) ?? 'unknown',
      });
    }
    // Add primaryTeacher AND primaryStudent off-daf nodes when the teacher
    // toggle is on. Both are needed so 'teacher' and 'student' lanes can
    // both render endpoints.
    if (included().has('teacher')) {
      const addOffDaf = (slug: string) => {
        if (seen.has(slug)) return;
        seen.add(slug);
        const gn = graph()?.nodes[slug];
        const gen = gn?.generation ?? null;
        out.push({
          slug,
          label: gn?.canonical ?? slug,
          labelHe: gn?.canonicalHe ?? '',
          generation: gen,
          band: bandFor(gen) ?? 'unknown',
        });
      };
      for (const slug of dafSlugs()) {
        const rec = unified()[slug];
        if (rec?.primaryTeacher) addOffDaf(rec.primaryTeacher);
        if (rec?.primaryStudent) addOffDaf(rec.primaryStudent);
      }
    }
    return out;
  });

  interface DiagramEdge { from: string; to: string; kind: EdgeKind }
  const edges = createMemo<DiagramEdge[]>(() => {
    const out: DiagramEdge[] = [];
    const seen = new Set<string>();
    const push = (e: DiagramEdge) => {
      const k = `${e.kind}|${e.from}|${e.to}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(e);
    };
    /** Pair de-dupe key independent of direction — a single relationship
     *  X-Y should never spawn both an 'X→Y teacher' and a 'Y→X student'. */
    const pairSeen = new Set<string>();
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const onDaf = new Set(dafSlugs());

    if (included().has('argues') || included().has('supports')) {
      const net = argNet();
      if (net) {
        for (const p of net.pairs) {
          if (p.kind === 'argues' && included().has('argues')) push({ from: p.a, to: p.b, kind: 'argues' });
          if (p.kind === 'supports' && included().has('supports')) push({ from: p.a, to: p.b, kind: 'supports' });
        }
      }
    }

    if (included().has('teacher')) {
      // Each on-daf rabbi → their primaryTeacher (edge ends at teacher).
      for (const slug of dafSlugs()) {
        const rec = unified()[slug];
        const t = rec?.primaryTeacher;
        if (t) {
          const key = pairKey(slug, t);
          if (!pairSeen.has(key)) {
            pairSeen.add(key);
            push({ from: slug, to: t, kind: 'teacher' });
          }
        }
        // Each on-daf rabbi → their primaryStudent (edge ends at student).
        const s = rec?.primaryStudent;
        if (s) {
          const key = pairKey(slug, s);
          if (!pairSeen.has(key)) {
            pairSeen.add(key);
            push({ from: slug, to: s, kind: 'student' });
          }
        }
      }
      // Daf-internal edges from rabbi-graph: when both endpoints are on
      // this daf, classify by which list the relationship lives in.
      const g = graph();
      if (g) {
        for (const slug of dafSlugs()) {
          const node = g.nodes[slug];
          if (!node) continue;
          for (const t of node.teachers) {
            if (!t.slug || !onDaf.has(t.slug)) continue;
            const key = pairKey(slug, t.slug);
            if (pairSeen.has(key)) continue;
            pairSeen.add(key);
            push({ from: slug, to: t.slug, kind: 'teacher' });
          }
          for (const s of node.students) {
            if (!s.slug || !onDaf.has(s.slug)) continue;
            const key = pairKey(slug, s.slug);
            if (pairSeen.has(key)) continue;
            pairSeen.add(key);
            push({ from: slug, to: s.slug, kind: 'student' });
          }
        }
      }
    }

    return out;
  });

  // ---- DOM measurement for SVG edges --------------------------------------
  // Routing model (mirrored from RabbiTreeStrip): every edge exits its source
  // node from its RIGHT edge, runs to a multi-track lane reserved on the right
  // of the canvas, traverses vertically, then re-enters the target's right
  // edge. Overlapping vertical segments are greedily assigned to distinct
  // tracks so they don't stack and create the criss-cross spaghetti.
  let containerEl: HTMLDivElement | undefined;
  const nodeRefs = new Map<string, HTMLDivElement>();
  interface EdgeCoord { kind: EdgeKind; x1: number; y1: number; x2: number; y2: number; laneX: number }
  const [edgeCoords, setEdgeCoords] = createSignal<EdgeCoord[]>([]);
  const [svgSize, setSvgSize] = createSignal({ w: 0, h: 0 });

  const recompute = () => {
    if (!containerEl) return;
    const cRect = containerEl.getBoundingClientRect();
    setSvgSize({ w: cRect.width, h: cRect.height });
    interface Raw { kind: EdgeKind; x1: number; y1: number; x2: number; y2: number; idx: number }
    const raw: Raw[] = [];
    let maxNodeRight = 0;
    // Use the rightmost node edge across the full layout, not just edge
    // endpoints, so the lane sits just past whatever node sticks out
    // furthest. This collapses the dead space the lane was opening up
    // to the right of the diagram.
    for (const el of nodeRefs.values()) {
      const r = el.getBoundingClientRect();
      const right = r.right - cRect.left;
      if (right > maxNodeRight) maxNodeRight = right;
    }
    for (const e of edges()) {
      const fromEl = nodeRefs.get(e.from);
      const toEl = nodeRefs.get(e.to);
      if (!fromEl || !toEl) continue;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      raw.push({
        kind: e.kind,
        x1: fr.right - cRect.left,
        y1: fr.top - cRect.top + fr.height / 2,
        x2: tr.right - cRect.left,
        y2: tr.top - cRect.top + tr.height / 2,
        idx: raw.length,
      });
    }

    // Per-kind track assignment. Lane bands stack outward (away from the
    // nodes) in this order: argues (innermost), supports, teacher, student.
    // Each band is its own greedy interval-graph allocator so two edges of
    // the same kind don't share a track. Bands are spaced by BAND_GAP_X so
    // different kinds never share a track either. This is the circuit-trace
    // pattern: each signal type gets its own lane region.
    const TRACK_GAP_Y = 6;
    const TRACK_STEP_X = 10;
    const BAND_GAP_X = 8;
    const KIND_ORDER: EdgeKind[] = ['argues', 'supports', 'teacher', 'student'];
    const baseLaneX = maxNodeRight + 14;

    const trackByIdx = new Array<number>(raw.length).fill(0);
    const widthByKind: Record<EdgeKind, number> = { argues: 0, supports: 0, teacher: 0, student: 0 };

    // First pass: per-kind greedy track assignment using the standard
    // interval-graph algorithm, sorted by lo y.
    for (const kind of KIND_ORDER) {
      const items = raw
        .filter((r) => r.kind === kind)
        .map((r) => ({ idx: r.idx, lo: Math.min(r.y1, r.y2), hi: Math.max(r.y1, r.y2) }))
        .sort((a, b) => a.lo - b.lo);
      const trackFreeAt: number[] = [];
      for (const it of items) {
        let t = trackFreeAt.findIndex((free) => free + TRACK_GAP_Y < it.lo);
        if (t === -1) { t = trackFreeAt.length; trackFreeAt.push(0); }
        trackFreeAt[t] = it.hi;
        trackByIdx[it.idx] = t;
      }
      widthByKind[kind] = trackFreeAt.length;
    }

    // Second pass: convert (kind, track) → laneX. Bands stack outward.
    let cursorX = baseLaneX;
    const bandStartX: Record<EdgeKind, number> = { argues: 0, supports: 0, teacher: 0, student: 0 };
    for (const kind of KIND_ORDER) {
      bandStartX[kind] = cursorX;
      const w = widthByKind[kind];
      if (w > 0) {
        cursorX += (w - 1) * TRACK_STEP_X + BAND_GAP_X;
      }
    }

    setEdgeCoords(raw.map((ep) => ({
      kind: ep.kind,
      x1: ep.x1, y1: ep.y1, x2: ep.x2, y2: ep.y2,
      laneX: bandStartX[ep.kind] + trackByIdx[ep.idx] * TRACK_STEP_X,
    })));
  };

  // Recompute whenever edges/nodes change, on resize, and after a frame so
  // layout has settled.
  createEffect(() => {
    void edges();
    void nodes();
    void included();
    requestAnimationFrame(() => requestAnimationFrame(recompute));
  });

  if (typeof window !== 'undefined') {
    const onResize = () => recompute();
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  }

  // One column per band, rabbis stacked chronologically by sub-generation.
  interface BandRowColumn { key: string; label: string; nodes: DiagramNode[] }
  interface BandRow { id: string; label: string; color: string; columns: BandRowColumn[] }

  /** Chronological sort comparator for nodes within a band: numeric
   *  sub-generation first (1, 2, 3...), then named keys (pre, sav, gaon). */
  const chronoCmp = (a: DiagramNode, b: DiagramNode): number => {
    const ka = columnKey(a.generation);
    const kb = columnKey(b.generation);
    const na = parseInt(ka, 10);
    const nb = parseInt(kb, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return ka.localeCompare(kb);
  };

  const bandRows = createMemo<BandRow[]>(() => {
    const buckets = new Map<BandId | 'unknown', DiagramNode[]>();
    for (const n of nodes()) {
      const arr = buckets.get(n.band) ?? [];
      arr.push(n);
      buckets.set(n.band, arr);
    }
    for (const arr of buckets.values()) arr.sort(chronoCmp);
    const rows: BandRow[] = [];
    for (const b of ERA_BANDS) {
      const list = buckets.get(b.id);
      if (!list || list.length === 0) continue;
      rows.push({
        id: b.id,
        label: b.label,
        color: b.color,
        columns: [{ key: 'main', label: '', nodes: list }],
      });
    }
    if (buckets.has('unknown')) {
      rows.push({
        id: 'unknown',
        label: 'UNKNOWN',
        color: '#cbd5e1',
        columns: [{ key: 'unknown', label: '', nodes: buckets.get('unknown')! }],
      });
    }
    return rows;
  });

  return (
    <>
      <style>{ENRICHMENT_TOGGLE_CSS}{TREE_TAB_CSS}</style>

      <section class="panel enrich-bar tree-toggle-bar">
        <Show when={props.onReloadSkeleton}>
          <button class="toggle-pill toggle-off-empty reload-skel" onClick={() => props.onReloadSkeleton?.()} title="Re-run the rabbi/argument first-pass from scratch.">
            <span class="toggle-mark">↻</span>
            <span class="toggle-label">Reload skeleton</span>
          </button>
        </Show>
        <span class="enrich-label">Enrichments</span>
        <EnrichmentToggle
          id="argues"
          label="Argues"
          desc="Pairs where one rabbi explicitly disputes the other on this daf."
          cached={argNetCached()}
          included={included().has('argues')}
          running={!!running().argues}
          error={errors().argues}
          onClick={() => void toggle('argues')}
        />
        <EnrichmentToggle
          id="supports"
          label="Supports"
          desc="Pairs where one rabbi cites or restates the other approvingly on this daf."
          cached={argNetCached()}
          included={included().has('supports')}
          running={!!running().supports}
          error={errors().supports}
          onClick={() => void toggle('supports')}
        />
        <EnrichmentToggle
          id="teacher"
          label="Teacher / student"
          desc="Each rabbi's primary teacher PLUS any teacher↔student edges between two rabbis on this daf."
          cached={teacherCached()}
          included={included().has('teacher')}
          running={!!running().teacher}
          error={errors().teacher}
          onClick={() => void toggle('teacher')}
        />
        <Show when={argNet()}>
          <button class="enrich-btn tree-arg-refresh" disabled={!!running().argues || !!running().supports} onClick={() => void refreshArgNet()} title="Re-run the argues/supports LLM pass.">↻</button>
        </Show>
      </section>

      <section class="panel tree-legend">
        <span class="tree-legend-item"><svg width="40" height="10"><line x1="2" y1="5" x2="36" y2="5" stroke="#b91c1c" stroke-width="1.5" stroke-dasharray="4 3" /></svg> argues</span>
        <span class="tree-legend-item"><svg width="40" height="10"><line x1="2" y1="5" x2="36" y2="5" stroke="#16a34a" stroke-width="1.5" /></svg> supports</span>
        <span class="tree-legend-item"><svg width="40" height="10"><line x1="2" y1="5" x2="36" y2="5" stroke="#475569" stroke-width="1.5" /></svg> → teacher</span>
        <span class="tree-legend-item"><svg width="40" height="10"><line x1="2" y1="5" x2="36" y2="5" stroke="#7c3aed" stroke-width="1.5" /></svg> → student</span>
      </section>

      <Show when={ctx.loading && !ctx()}><p class="loading">Loading rabbis…</p></Show>
      <Show when={ctx() && dafSlugs().length === 0}>
        <section class="panel empty">No identifiable rabbis on this daf.</section>
      </Show>

      <Show when={ctx() && dafSlugs().length > 0}>
        <section class="panel tree-canvas">
          <div class="tree-container" ref={(el) => (containerEl = el)}>
            <For each={bandRows()}>{(band) => (
              <div class="tree-band">
                <div class="tree-band-label" style={{ background: band.color }}>{band.label}</div>
                <div class="tree-band-content">
                  <For each={band.columns}>{(col) => (
                    <div class="tree-column">
                      <Show when={col.label}><div class="tree-column-label">{col.label}</div></Show>
                      <div class="tree-column-nodes">
                        <For each={col.nodes}>{(n) => (
                          <div
                            class="tree-node"
                            ref={(el) => { if (el) nodeRefs.set(n.slug, el); }}
                            title={`${n.label}${n.labelHe ? ' · ' + n.labelHe : ''} (${n.slug})`}
                          >
                            <span class="tree-node-en">{compactName(n.label, n.slug)}</span>
                            <Show when={n.labelHe}><span class="tree-node-he">{n.labelHe}</span></Show>
                          </div>
                        )}</For>
                      </div>
                    </div>
                  )}</For>
                </div>
              </div>
            )}</For>

            <svg class="tree-svg" width={svgSize().w} height={svgSize().h}>
              <defs>
                <marker id="tree-arrow-teacher" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
                </marker>
                <marker id="tree-arrow-student" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="#7c3aed" />
                </marker>
                <marker id="tree-arrow-argues" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="#b91c1c" />
                </marker>
                <marker id="tree-arrow-supports" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="#16a34a" />
                </marker>
              </defs>
              <For each={edgeCoords()}>{(e) => {
                // Rectilinear path through the right-hand lane: out the right
                // edge, into the assigned track, vertical traversal, then
                // back left to the target's right edge.
                const r = 4;
                const dir = e.y2 >= e.y1 ? 1 : -1;
                const midEnterY = e.y1 + dir * r;
                const midExitY = e.y2 - dir * r;
                const d = [
                  `M ${e.x1} ${e.y1}`,
                  `L ${e.laneX - r} ${e.y1}`,
                  `Q ${e.laneX} ${e.y1} ${e.laneX} ${midEnterY}`,
                  `L ${e.laneX} ${midExitY}`,
                  `Q ${e.laneX} ${e.y2} ${e.laneX - r} ${e.y2}`,
                  `L ${e.x2} ${e.y2}`,
                ].join(' ');
                const stroke =
                  e.kind === 'argues'   ? '#b91c1c' :
                  e.kind === 'supports' ? '#16a34a' :
                  e.kind === 'teacher'  ? '#475569' :
                  '#7c3aed';
                const dash = e.kind === 'argues' ? '4 3' : '';
                const marker =
                  e.kind === 'argues'   ? 'url(#tree-arrow-argues)' :
                  e.kind === 'supports' ? 'url(#tree-arrow-supports)' :
                  e.kind === 'teacher'  ? 'url(#tree-arrow-teacher)' :
                  'url(#tree-arrow-student)';
                return (
                  <path
                    d={d}
                    fill="none"
                    stroke={stroke}
                    stroke-width="1.4"
                    stroke-dasharray={dash}
                    marker-end={marker}
                    opacity={0.9}
                  />
                );
              }}</For>
            </svg>
          </div>
        </section>

        <Show when={argNet() && (included().has('argues') || included().has('supports'))}>
          {(_) => {
            const filtered = () => (argNet()?.pairs ?? []).filter((p) =>
              (p.kind === 'argues' && included().has('argues')) ||
              (p.kind === 'supports' && included().has('supports')),
            );
            return (
              <Show when={filtered().length > 0}>
                <section class="panel tree-pair-list">
                  <span class="enrich-label">Pair details</span>
                  <ul class="tree-pair-ul">
                    <For each={filtered()}>{(p) => (
                      <li class="tree-pair-row" classList={{ 'tree-pair-argues': p.kind === 'argues', 'tree-pair-supports': p.kind === 'supports' }}>
                        <span class="tree-pair-slug">{p.a}</span>
                        <span class="tree-pair-rel">{p.kind === 'argues' ? '⊥ argues' : '+ supports'}</span>
                        <span class="tree-pair-slug">{p.b}</span>
                        <Show when={p.section}><span class="tree-pair-section">§ {p.section}</span></Show>
                        <Show when={p.evidence}><p class="tree-pair-evidence">{p.evidence}</p></Show>
                      </li>
                    )}</For>
                  </ul>
                </section>
              </Show>
            );
          }}
        </Show>
      </Show>
    </>
  );
}

const TREE_TAB_CSS = `
.tree-toggle-bar { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; padding: 0.5rem 0.75rem; }
.tree-arg-refresh { padding: 0.2rem 0.55rem; font-size: 12px; }

.tree-legend { display: flex; gap: 1.2rem; padding: 0.4rem 0.75rem; font-size: 11.5px; color: #475569; align-items: center; flex-wrap: wrap; }
.tree-legend-item { display: inline-flex; align-items: center; gap: 0.4rem; }

.tree-canvas { padding: 0.6rem 0.75rem; overflow-x: auto; }
/* Right padding reserves space for the SVG connector lanes (per-kind). The
 * lane positions are computed from the rightmost node + a small offset, so
 * 60px is enough headroom even with all three kinds active. */
.tree-container { position: relative; min-height: 280px; min-width: max-content; padding-right: 60px; }
.tree-band { display: flex; align-items: stretch; gap: 0.5rem; padding: 0.5rem 0; min-height: 60px; border-bottom: 1px solid #f1f5f9; }
.tree-band:last-child { border-bottom: none; }
.tree-band-label { writing-mode: vertical-rl; transform: rotate(180deg); display: flex; align-items: center; justify-content: center; min-width: 24px; padding: 0.4rem 0.15rem; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: white; border-radius: 3px; }
.tree-band-content { flex: 1; display: flex; gap: 0.8rem; align-items: flex-start; padding: 0.2rem 0.3rem; min-width: 0; }
.tree-column { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
.tree-column-label { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; padding: 0 0.2rem; text-align: center; }
.tree-column-nodes { display: flex; flex-direction: column; gap: 0.25rem; align-items: stretch; }
.tree-node { padding: 3px 8px; background: #1e3a8a; color: white; border-radius: 4px; font-size: 10.5px; font-weight: 600; cursor: default; display: flex; flex-direction: column; gap: 1px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.1); white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.tree-node-en { font-size: 10.5px; text-overflow: ellipsis; overflow: hidden; }
.tree-node-he { font-size: 10px; opacity: 0.85; font-weight: 400; font-family: 'SBL Hebrew', 'Times New Roman', serif; }

.tree-svg { position: absolute; top: 0; left: 0; pointer-events: none; }

.tree-pair-list { padding: 0.55rem 0.75rem; }
.tree-pair-ul { list-style: none; padding: 0; margin: 0.3rem 0 0; display: flex; flex-direction: column; gap: 0.3rem; }
.tree-pair-row { padding: 0.35rem 0.5rem; border-radius: 3px; border-left: 3px solid #cbd5e1; background: #fff; display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: baseline; font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; }
.tree-pair-argues { border-left-color: #b91c1c; background: #fef2f2; }
.tree-pair-supports { border-left-color: #16a34a; background: #f0fdf4; }
.tree-pair-slug { color: #1e293b; font-weight: 600; }
.tree-pair-rel { font-size: 10.5px; padding: 1px 6px; border-radius: 10px; background: white; border: 1px solid #e2e8f0; color: #64748b; }
.tree-pair-argues .tree-pair-rel { color: #b91c1c; border-color: #fecaca; }
.tree-pair-supports .tree-pair-rel { color: #166534; border-color: #bbf7d0; }
.tree-pair-section { font-size: 11px; color: #94a3b8; margin-left: auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.tree-pair-evidence { flex-basis: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11.5px; color: #475569; margin: 0.2rem 0 0; line-height: 1.45; }
`;
