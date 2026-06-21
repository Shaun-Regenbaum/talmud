/**
 * Talmud source resolvers — the app-specific halves of producer input
 * resolution (stage 4a). Each resolver here is the body of one string-dep
 * branch cut from index.ts's resolveDependencies; the corpus-agnostic walk
 * that invokes them lives in @corpus/core/run/producer-run.
 *
 * Helpers that remain index-private (they serve routes and other run paths
 * too, or lean on index-private utilities like stripHtmlServer) are injected
 * via `RunSourceHelpers`; everything else is imported directly.
 */

import {
  contextForAnchor,
  formatContextForPrompt,
  segsFromMarkInput,
} from '@corpus/core/context/select';
import { recordSource, type SourceResolver } from '@corpus/core/run/producer-run';
import { formatGroundedRefsForPrompt } from '../lib/halacha/codifiers';
import { adjacentAmud } from '../lib/sefref';
import type { DafBridge } from '../lib/typing/bridge';
import type { YerushalmiOutlinePoint } from '../lib/yerushalmiAlign';
import { type YerushalmiFloorGroup, yerushalmiFloorGroups } from '../lib/yerushalmiAlign';
import { type CuratedYerushalmiParallel, curatedParallelsForDaf } from '../lib/yerushalmiParallels';
import { keyForBridge } from './cache-keys';
import { collectContext } from './context-providers';
import { placeRevachWithAi } from './revach-ai-place';
import { getHalachaRefsCached, getMishnaBundleCached, getYerushalmiCached } from './source-cache';
import type { Bindings } from './types';

/** The slice of the run context the source resolvers need. The host's RunCtx
 *  is structurally assignable (it carries env plus url/ctx/lang on top). */
export interface RunSourceCtx {
  env: Bindings;
}

export interface GemaraSlice {
  tractate: string;
  page: string;
  hebrew: string;
  english: string;
  segments_he: string[];
  segments_en: string[];
}

export interface CommentariesSlice {
  tractate: string;
  page: string;
  /** Map of commentator name → { hebrew, english, ref }. Empty {} if Sefaria
   *  has nothing on this daf. */
  by_commentator: Record<string, { hebrew: string; english: string; ref: string }>;
}

function gemaraSliceToVars(s: GemaraSlice): Record<string, unknown> {
  return {
    tractate: s.tractate,
    page: s.page,
    hebrew: s.hebrew,
    english: s.english,
    gemara_he: s.hebrew,
    gemara_en: s.english,
    segments_he: s.segments_he,
    segments_en: s.segments_en,
    gemara: `${s.hebrew}\n\n---\n\n${s.english}`,
  };
}

// The full rishonim of a dense daf (e.g. Bava Metzia 2b) run to well over a
// million tokens — enough to blow past the model's 1,048,576-token context
// limit and HARD-FAIL the whole enrichment (a 400, so the daf got no synthesis
// at all). Cap the commentary text fed into prompts: per-commentator caps keep
// every commentator represented; the total budget is the backstop. Limits are
// generous so ordinary dapim are unaffected (their text is well under), and the
// cap never touches cache keys (those derive from markInput+recipe, not source
// text) — so existing cached output is untouched and only re-runs see the trim.
const COMMENTARY_PER_WORK_HE = 12_000;
const COMMENTARY_PER_WORK_EN = 16_000;
const COMMENTARY_TOTAL_BUDGET = 360_000;

function capText(s: string, max: number): string {
  const clean = (s ?? '').trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()} …[trimmed]` : clean;
}

export function commentariesSliceToString(s: CommentariesSlice): string {
  const names = Object.keys(s.by_commentator).sort();
  const parts: string[] = [];
  let used = 0;
  let omitted = 0;
  for (const n of names) {
    if (used >= COMMENTARY_TOTAL_BUDGET) {
      omitted++;
      continue;
    }
    const row = s.by_commentator[n];
    const block = `[${n}]\n${capText(row.hebrew, COMMENTARY_PER_WORK_HE)}\n${capText(
      row.english,
      COMMENTARY_PER_WORK_EN,
    )}`.trim();
    parts.push(block);
    used += block.length;
  }
  // Never silently truncate: tell the model (and the inspector) what was dropped.
  if (omitted > 0) {
    parts.push(`[… ${omitted} further commentaries omitted to fit the context budget]`);
  }
  return parts.join('\n\n---\n\n');
}

/**
 * Filter the daf's mishna bundle to those relevant for an enrichment with
 * the given markInput. Rule: include any mishna whose anchor START segment
 * is at-or-before the mark's END segment. This covers the "current" mishna
 * being discussed and any earlier-on-daf mishnayot that the argument may
 * still be elaborating on, while excluding mishnayot the gemara hasn't
 * reached yet. If markInput has no endSegIdx (e.g. daf-level aggregate),
 * include everything.
 */
function selectMishnaForMark(
  bundle: Awaited<ReturnType<typeof getMishnaBundleCached>>,
  markInput: unknown,
): typeof bundle {
  if (!bundle.length) return bundle;
  const m =
    markInput && typeof markInput === 'object' ? (markInput as Record<string, unknown>) : null;
  const endSeg =
    m && typeof m.endSegIdx === 'number'
      ? m.endSegIdx
      : m && typeof m.startSegIdx === 'number'
        ? m.startSegIdx
        : null;
  if (endSeg === null) return bundle;
  return bundle.filter((x) => x.anchorStartSeg <= endSeg);
}

function mishnaBundleToString(bundle: Awaited<ReturnType<typeof getMishnaBundleCached>>): string {
  if (!bundle.length) return '(no mishnah anchored to this daf)';
  return bundle
    .map((m) => {
      const range =
        m.anchorStartSeg === m.anchorEndSeg
          ? `segment ${m.anchorStartSeg}`
          : `segments ${m.anchorStartSeg}-${m.anchorEndSeg}`;
      return `[${m.ref}] (anchors gemara ${range})\nHE: ${m.hebrew}\nEN: ${m.english}`.trim();
    })
    .join('\n\n---\n\n');
}

// 'context-light' keep-list: the accessible, idea-rich study aids only. Drops
// the commentary + halachic-apparatus layers (sefaria-rashi/tosafot/rishonim/
// halacha/topic, dafyomi halacha/tosfos/hebcharts/review-of-mechanics) that
// pull a reader-facing piece toward lomdus.
const LIGHT_CONTEXT_SOURCES = new Set<string>([
  'sefaria-mishnah',
  'dafyomi:insights',
  'dafyomi:points',
  'dafyomi:background',
  'dafyomi:yerushalmi',
  'dafyomi:revach',
]);

/** Mark-instance shape as read back from the cache (matches index's RawInstance). */
export interface RawMarkInstance {
  startSegIdx?: unknown;
  endSegIdx?: unknown;
  fields?: Record<string, unknown>;
}

/** Index-private helpers the resolvers wrap — injected because they also serve
 *  routes / other run paths in index.ts (or depend on its private utilities),
 *  so they cannot move here without a circular import. `Curated` is the host's
 *  curated-Yerushalmi passage list type, opaque to the resolvers (fetched, then
 *  handed straight back to the host's formatter). */
export interface RunSourceHelpers<Curated> {
  getGemaraSlice(
    env: Bindings,
    tractate: string,
    page: string,
    bypass: boolean,
  ): Promise<GemaraSlice>;
  getCommentariesSlice(
    env: Bindings,
    tractate: string,
    page: string,
    bypass: boolean,
  ): Promise<CommentariesSlice>;
  readMarkInstances(
    env: Bindings,
    markId: string,
    tractate: string,
    page: string,
  ): Promise<RawMarkInstance[]>;
  computeDafBridge(env: Bindings, tractate: string, page: string): Promise<DafBridge>;
  fetchCuratedYerushalmi(parallels: CuratedYerushalmiParallel[]): Promise<Curated>;
  buildYerushalmiOutline(
    env: Bindings,
    tractate: string,
    page: string,
  ): Promise<YerushalmiOutlinePoint[]>;
  formatYerushalmiForPrompt(
    bundle: Awaited<ReturnType<typeof getYerushalmiCached>>,
    curated: Curated,
    outline: YerushalmiOutlinePoint[],
    floor: YerushalmiFloorGroup[],
  ): string;
}

/** Build the source-resolver map for the producer-run walk. Keys are the
 *  legacy dependency tokens; 'gemara' doubles as the default source applied
 *  when a producer declares no dependencies. */
export function buildSourceResolvers<Curated>(
  h: RunSourceHelpers<Curated>,
): Record<string, SourceResolver<RunSourceCtx>> {
  // Aggregated external context (dafyomi Points/Halacha/Charts + Sefaria
  // Rishonim/halacha/topics), SCOPED to the instance's segments: a section
  // enrichment gets the context grounded to its own lines; a whole-daf one
  // (no segment location) gets the full pool. Each source that fails
  // contributes nothing rather than throwing.
  // 'context-light' drops the commentary/halachic-apparatus layers (Rashi,
  // Tosafot, rishonim, sefaria-halacha/topic, dafyomi halacha/tosfos/charts)
  // and keeps only the accessible, idea-rich aids — so the Tidbit isn't fed
  // the lomdus that kept pulling it scholarly. The Bi'yun uses full 'context'.
  const context: SourceResolver<RunSourceCtx> = async ({
    ctx,
    name,
    out,
    tractate,
    page,
    markInput,
    sourcesOnly,
  }) => {
    // This amud's argument sections let Revach summaries be placed per-section
    // (English↔English alignment, conservative); a cheap cached read.
    const sections = (await h.readMarkInstances(ctx.env, 'argument', tractate, page))
      .filter((i) => typeof i.startSegIdx === 'number' && typeof i.endSegIdx === 'number')
      .map((i) => ({
        startSegIdx: i.startSegIdx as number,
        endSegIdx: i.endSegIdx as number,
        title: typeof i.fields?.title === 'string' ? i.fields.title : undefined,
        summary: typeof i.fields?.summary === 'string' ? i.fields.summary : undefined,
      }));
    const allItems = await collectContext(ctx.env, tractate, page, { sections });
    const items =
      name === 'context-light'
        ? allItems.filter((it) => LIGHT_CONTEXT_SOURCES.has(it.source))
        : allItems;
    // Back up the deterministic Revach placer with the cached AI matcher for
    // any entries it left whole-daf (once per daf; LLM-free on cache hit). In
    // the source-only inspector pass, run it cache-only so the preview still
    // reflects already-cached placements but NEVER triggers the matcher on a
    // cold daf.
    await placeRevachWithAi(ctx.env, tractate, page, items, sourcesOnly);
    const scoped = contextForAnchor(items, segsFromMarkInput(markInput));
    out.vars.context = formatContextForPrompt(scoped);
    // Break the aggregated context into its constituent study-aids for the
    // inspector instead of one opaque blob: group the scoped items by their
    // `source` (sefaria-rashi / sefaria-rishonim / sefaria-topic / dafyomi:* /
    // …) and record each part, rendered with the same formatter the prompt
    // uses so every part is faithful to that source's contribution. Key as
    // `context-<kind>` (provider prefix stripped) so chips read cleanly
    // ("Context rashi", "Context points", "Context revach"). `out.vars.context`
    // (above) stays the combined string the prompt actually consumes.
    const byContextSource = new Map<string, typeof scoped>();
    for (const it of scoped) {
      const group = byContextSource.get(it.source) ?? [];
      group.push(it);
      byContextSource.set(it.source, group);
    }
    for (const [src, group] of byContextSource) {
      const kind = src.replace(/^sefaria-/, '').replace(/^dafyomi:/, '');
      recordSource(out, `context-${kind}`, formatContextForPrompt(group));
    }
  };

  return {
    gemara: async ({ ctx, out, tractate, page, bypassCache }) => {
      const slice = await h.getGemaraSlice(ctx.env, tractate, page, bypassCache);
      Object.assign(out.vars, gemaraSliceToVars(slice));
      recordSource(out, 'gemara', out.vars.gemara);
    },
    commentaries: async ({ ctx, out, tractate, page, bypassCache }) => {
      const slice = await h.getCommentariesSlice(ctx.env, tractate, page, bypassCache);
      out.vars.commentaries = commentariesSliceToString(slice);
      recordSource(out, 'commentaries', out.vars.commentaries);
    },
    mishna: async ({ ctx, out, tractate, page, markInput }) => {
      const bundle = await getMishnaBundleCached(ctx.env.CACHE, tractate, page);
      const filtered = selectMishnaForMark(bundle, markInput);
      out.vars.mishna = mishnaBundleToString(filtered);
      recordSource(out, 'mishna', out.vars.mishna);
    },
    'halacha-refs': async ({ ctx, out, tractate, page }) => {
      // Grounded codifier refs (Mishneh Torah / Tur / Shulchan Aruch) that
      // Sefaria links to this daf, with their real text — so the codification
      // enrichment SELECTS from real refs instead of recalling citations.
      const bundle = await getHalachaRefsCached(ctx.env.CACHE, tractate, page);
      out.vars.halacha_refs = formatGroundedRefsForPrompt(bundle);
      recordSource(out, 'halacha-refs', out.vars.halacha_refs);
    },
    'yerushalmi-text': async ({ ctx, out, tractate, page }) => {
      // Three grounding tiers: (1) curated Bavli<->Yerushalmi parallels a human
      // confirmed (often cross-tractate — the mishnah-mapping can't find them),
      // (2) the Jerusalem Talmud parallel(s) on the same mishnah (real text via
      // fetchYerushalmiForDaf), (3) the ALIGNED dafyomi "Yerushalmi to Match"
      // outline — a structured, segment-anchored summary of exactly what the
      // Yerushalmi says, so the producer contrasts the two PART-BY-PART rather
      // than from memory. Each source that fails contributes nothing.
      const [bundle, curated, outline] = await Promise.all([
        getYerushalmiCached(ctx.env.CACHE, tractate, page),
        h.fetchCuratedYerushalmi(curatedParallelsForDaf(tractate, page)),
        h.buildYerushalmiOutline(ctx.env, tractate, page),
      ]);
      // Deterministic floor anchors — the verbatim-shared spans the mark MUST
      // surface. Fed to the prompt (REQUIRED ANCHORS) so the model writes their
      // differences, and stashed for the yerushalmi-floor pass, which backstops
      // any the model still drops. The double-underscore key is internal (not a
      // prompt placeholder).
      const floor = yerushalmiFloorGroups(outline);
      out.vars.yerushalmi = h.formatYerushalmiForPrompt(bundle, curated, outline, floor);
      out.vars.__yerushalmiFloor = floor;
      recordSource(out, 'yerushalmi-text', out.vars.yerushalmi);
    },
    incoming: async ({ ctx, out, tractate, page, sourcesOnly }) => {
      // How this daf connects to the PREVIOUS one. Read the prev->this bridge
      // (computeDafBridge on the previous daf judges its last argument section
      // against this daf's first). When the sugya carries over, expose its
      // grounded note so a whole-daf overview can open with where the page comes
      // from — never recalled from the model's memory. Empty when the daf opens
      // fresh, the previous daf isn't warmed, or this is the tractate's first
      // daf. In the inspector's sourcesOnly pass, read cache-only so it never
      // triggers the bridge model. Best-effort: any failure contributes nothing.
      try {
        const prevPage = adjacentAmud(tractate, page, -1);
        if (prevPage) {
          let bridge: DafBridge | null = null;
          if (sourcesOnly) {
            const c = ctx.env.CACHE
              ? await ctx.env.CACHE.get(keyForBridge(tractate, prevPage))
              : null;
            if (c) {
              try {
                bridge = JSON.parse(c) as DafBridge;
              } catch {
                /* ignore */
              }
            }
          } else {
            bridge = await h.computeDafBridge(ctx.env, tractate, prevPage);
          }
          if (bridge?.continues && typeof bridge.note === 'string' && bridge.note.trim()) {
            out.vars.incoming = `Continues the discussion from the previous daf (${tractate} ${prevPage}): ${bridge.note.trim()}`;
          }
        }
      } catch {
        /* no incoming context */
      }
      recordSource(out, 'incoming', (out.vars.incoming as string) ?? '');
    },
    context,
    'context-light': context,
  };
}
