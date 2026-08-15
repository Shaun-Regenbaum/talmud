/**
 * Tanach's wiring for the corpus-agnostic producer run — the PR-8 proof that a
 * queue-less, registry-less app runs the IDENTICAL core runProducer the talmud
 * worker runs. Everything app-specific enters here:
 *
 *  - ArtifactStore over env.CACHE with templateKeyScheme — the per-producer-id
 *    literal key templates, copied BYTE-EXACTLY from the legacy hand-built
 *    keys in index.ts (events:v2:{book}:{chapter}, note:v1:{book}:{chapter}:
 *    {start}-{end}, synthesis:v1:{book}:{chapter}:{verse}, midrash-synth:v1:
 *    {book}:{chapter}:{verse}). Canonical key == legacy key, so no alias
 *    indirection is needed for the BYTES; what differs is the VALUE shape —
 *    see the legacy read adapter below.
 *  - LEGACY VALUE ADAPTER (cacheRead): pre-migration entries are the raw
 *    response payloads (events: {book,chapter,ref,sections}; note:
 *    {book,chapter,start,end,en,he}; synthesis / midrash-synthesis:
 *    {book,chapter,verse,en,he}), NOT StoredArtifact envelopes. A read that
 *    finds a non-envelope wraps it in a synthetic envelope (model/transport
 *    'legacy-cache', parsed = the payload) so runProducer serves it as a
 *    cache hit — ZERO regeneration cost for existing entries. Fresh writes
 *    store real envelopes (with provenance); both shapes serve through the
 *    same routes because the routes project from `parsed`, whose payload
 *    fields are a superset/equal in both shapes.
 *  - Source resolvers ('chapter-verses', 'section-verses', 'verse-text',
 *    'commentaries', 'midrash-passages') wrapping the existing Sefaria fetch
 *    helpers; route-visible failures throw TanachSourceError so the routes
 *    keep their legacy status codes + bodies.
 *  - The LLM port via the existing runLLM (model choice, call knobs and the
 *    `tanach:*` cost tags exactly as the legacy producer functions).
 *  - Usage attribution to the existing usage:v1 ledger (fire-and-forget via
 *    waitUntil, as before).
 *  - Passes/hooks: tanach has none — no-op ports — except markPostParse,
 *    which applies the events producer's legacy output normalization.
 */

import { instanceIdOf, recipeHash } from '@corpus/core/cache/keys';
import type { LLMEnv, LLMUsage } from '@corpus/core/llm/llm';
import { runLLM } from '@corpus/core/llm/llm';
import { costSplitUsd, costUsd, normalizeUsage } from '@corpus/core/llm/pricing';
import type { CostStamp } from '@corpus/core/model/provenance';
import type {
  ResolveInputsPorts,
  RunDependency,
  SourceResolver,
} from '@corpus/core/run/producer-run';
import { recordSource, resolveInputs } from '@corpus/core/run/producer-run';
import type { RunProducerPorts } from '@corpus/core/run/run-producer';
import { runProducer } from '@corpus/core/run/run-producer';
import { ArtifactStore } from '@corpus/core/store/artifact-store';
import type { StoredArtifact } from '@corpus/core/store/envelope';
import type { ArtifactAddress, KeyTemplate, ProducerKeyInfo } from '@corpus/core/store/key-schemes';
import { templateKeyScheme } from '@corpus/core/store/key-schemes';
import type { UsageEntry } from '@corpus/core/telemetry/types';
import {
  formatParshaRange,
  PARSHA_KINDS,
  type ParshaRange,
  type ParshaSectionKind,
  parseParshaRef,
  pointInParsha,
  sanitizeParshaTerms,
  sectionInParsha,
  type WeeklyParsha,
} from '../lib/parsha.ts';
import type { TanachEnrichmentDef, TanachMarkDef } from './producers/defs.ts';
import { enrichRunDefOf, markRunDefOf } from './producers/defs.ts';
import type { EventSection } from './producers/events.ts';
import { versesForPrompt } from './producers/events.ts';
import type { SourcePassage, VerseCommentary } from './sefaria-sources.ts';
import { asVerses, fetchPassages, fetchVerseCommentaries, sefaria } from './sefaria-sources.ts';
import { recordUsage as recordUsageEntry } from './usage.ts';

export interface TanachEnv extends LLMEnv {
  CACHE: KVNamespace;
}

/** Per-request run context: env + executionCtx (for fire-and-forget usage
 *  writes) + the usage-ledger ref the route attributes this run to (the same
 *  ref strings the legacy routes recorded: 'Genesis 1', 'Genesis 1:3-5', …). */
export interface TanachRunCtx {
  env: TanachEnv;
  ctx: ExecutionContext;
  ref: string;
}

/** A source-resolution failure the route should surface with a specific HTTP
 *  status + body — preserving the legacy routes' error responses exactly
 *  (404 for a Sefaria "ref not found" / not-enough-material, 502 for upstream
 *  fetch failures). Anything else a run throws maps to the legacy
 *  `Producer failed: …` 502. */
export class TanachSourceError extends Error {
  readonly status: 404 | 502;
  constructor(status: 404 | 502, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Key scheme — the literal templates, byte-exact to the legacy keys.
// translate:v1:{norm} is deliberately absent (raw string + TTL — outside
// ArtifactStore; see producers/translate.ts). midrash:v1:* is a SOURCE cache,
// not a producer output, and stays on direct KV in index.ts.
// ---------------------------------------------------------------------------

type TanachAddress = ArtifactAddress & {
  start?: string | number;
  end?: string | number;
  verse?: string | number;
};

const KEY_TEMPLATES: Record<string, KeyTemplate> = {
  events: { key: (a: TanachAddress) => `events:v2:${a.unit?.work}:${a.unit?.unit}` },
  note: {
    key: (a: TanachAddress) => `note:v1:${a.unit?.work}:${a.unit?.unit}:${a.start}-${a.end}`,
  },
  // Chapter-scoped: the key ignores the instance (there's one overview per
  // chapter), so enrichmentAddress('overview', …) carries no verse/range.
  overview: { key: (a: TanachAddress) => `overview:v1:${a.unit?.work}:${a.unit?.unit}` },
  // overview v3 / section v2 / thread v3: PARSHA_HEBREW_STYLE tightened to the
  // talmud reader's literal convention — Hebrew script is the DEFAULT surface
  // for the passage's key words and quoted phrases (dense Form A; the English
  // quote + Hebrew-in-parens inversion is rejected). One weekly parsha, so
  // each bump re-pays cents, not dollars.
  // overview v4: the composition estimate is gone (the route counts the split
  // off the anchored units instead), `kind` gains poetry + records, and unit
  // titles are capped at 2-5 words to fit the map's bands.
  'parsha-overview': { key: (a: TanachAddress) => `parsha-overview:v4:${a.instanceId}` },
  'parsha-section': { key: (a: TanachAddress) => `parsha-section:v2:${a.instanceId}` },
  'parsha-thread': { key: (a: TanachAddress) => `parsha-thread:v3:${a.instanceId}` },
  // Chapter-scoped like overview (one geography per chapter; instance ignored).
  // v2: the output now carries per-place verse numbers (for click-to-highlight).
  // v3: the prompt now excludes peoples (Jebusites) and personal names that
  // are spelled like places (Havilah as a son of Joktan) — cached chapters
  // carry those, and a few dozen entries are cheap to regenerate.
  geography: { key: (a: TanachAddress) => `geography:v3:${a.unit?.work}:${a.unit?.unit}` },
  // Chapter-scoped like overview/geography (one tidbit per chapter; instance ignored).
  // v2: prompt tuned (Hebrew script over transliteration, no markdown, worked
  // example swapped off a Torah chapter) — bump regenerates with the new recipe.
  tidbit: { key: (a: TanachAddress) => `tidbit:v2:${a.unit?.work}:${a.unit?.unit}` },
  synthesis: {
    key: (a: TanachAddress) => `synthesis:v1:${a.unit?.work}:${a.unit?.unit}:${a.verse}`,
  },
  // Producer id and key prefix differ on purpose — the id routes, the
  // template owns the literal bytes.
  'midrash-synthesis': {
    key: (a: TanachAddress) => `midrash-synth:v1:${a.unit?.work}:${a.unit?.unit}:${a.verse}`,
  },
};

export const TANACH_KEY_SCHEME = templateKeyScheme(KEY_TEMPLATES);

export function tanachArtifactStore(env: TanachEnv): ArtifactStore {
  return new ArtifactStore(env.CACHE, TANACH_KEY_SCHEME);
}

function keyInfoOf(
  def: { id: string; cache_version: string },
  key_shape: 'mark' | 'enrich',
): ProducerKeyInfo {
  // scope/key_shape are nominal here — templateKeyScheme routes by id only.
  return { id: def.id, cacheVersion: def.cache_version, scope: 'local', key_shape };
}

/** The template address for an enrichment run. runProducer hands the ports an
 *  instanceId (instanceIdOf of the route's markInput); the routes construct
 *  markInput with an explicit `id` that IS the legacy key component —
 *  `${start}-${end}` for note, `${verse}` for the per-verse producers — so
 *  instanceIdOf passes it through verbatim (digits and '-' survive slugId;
 *  locked by tests/producer-keys.test.ts) and we can map it back onto the
 *  template's semantic fields here. */
export function enrichmentAddress(
  id: string,
  instanceId: string,
  book: string,
  chapter: string,
): TanachAddress {
  const unit = { work: book, unit: chapter };
  if (id === 'note') {
    const [start, end] = instanceId.split('-');
    return { unit, instanceId, start, end };
  }
  // Parsha pieces key on their explicit ref/range instance rather than chapter.
  if (id === 'parsha-overview' || id === 'parsha-section' || id === 'parsha-thread') {
    return { unit, instanceId };
  }
  // Chapter-scoped (overview / geography / tidbit): key uses only {work}:{unit}.
  if (id === 'overview' || id === 'geography' || id === 'tidbit') {
    return { unit, instanceId };
  }
  return { unit, instanceId, verse: instanceId };
}

/** The overview's literal KV key for a weekly parsha — lets the warm-cron gate
 *  per-section warming on whether the overview map is already cached. */
export async function parshaOverviewCacheKey(parsha: WeeklyParsha): Promise<string> {
  const def = enrichRunDefOf('parsha-overview');
  const instanceId = await instanceIdOf({ id: parsha.ref });
  return TANACH_KEY_SCHEME.key(
    keyInfoOf(def, 'enrich'),
    enrichmentAddress('parsha-overview', instanceId, parsha.book, parsha.ref),
  );
}

/** Guard an index-keyed parsha piece (close reading / thread) against a
 *  regenerated overview moving that index to a different anchored passage. */
export function enrichmentSectionRange(id: string, markInput: unknown): string | null {
  if (
    (id !== 'parsha-thread' && id !== 'parsha-section') ||
    !markInput ||
    typeof markInput !== 'object'
  )
    return null;
  const input = markInput as Record<string, unknown>;
  const parts = [input.startChapter, input.startVerse, input.endChapter, input.endVerse].map(
    Number,
  );
  if (!parts.every((part) => Number.isInteger(part) && part >= 1)) return null;
  return `${parts[0]}:${parts[1]}-${parts[2]}:${parts[3]}`;
}

// ---------------------------------------------------------------------------
// Legacy value adapter — what each producer's PRE-MIGRATION stored value looks
// like, and how it keeps serving (wrapped as a synthetic envelope; never
// rewritten, never regenerated):
//   events            events:v2:{book}:{chapter}         {book,chapter,ref,sections}
//   note              note:v1:{b}:{c}:{start}-{end}      {book,chapter,start,end,en,he}
//   synthesis         synthesis:v1:{b}:{c}:{verse}       {book,chapter,verse,en,he}
//   midrash-synthesis midrash-synth:v1:{b}:{c}:{verse}   {book,chapter,verse,en,he}
// A StoredArtifact envelope always carries string `content` + `model` and a
// `parsed` key; no legacy payload has any of those, so detection is safe.
// ---------------------------------------------------------------------------

export function isStoredArtifact(v: unknown): v is StoredArtifact {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.content === 'string' && typeof o.model === 'string' && 'parsed' in o;
}

function wrapLegacyValue(value: unknown): StoredArtifact {
  const note = '(legacy tanach cache entry — pre-envelope payload, served as-is)';
  return {
    content: JSON.stringify(value),
    parsed: value,
    parse_error: null,
    model: 'legacy-cache',
    transport: 'legacy-cache',
    attempts: 0,
    usage: null,
    elapsed_ms: 0,
    prompt_chars: 0,
    resolved: { system_prompt: note, user_prompt: note },
    cache_hit: true,
  };
}

async function readArtifactOrLegacy(env: TanachEnv, key: string): Promise<StoredArtifact | null> {
  // store.get keeps the legacy read semantics (null on miss, null on corrupt
  // JSON); the envelope check decides whether a wrap is needed.
  const stored = await tanachArtifactStore(env).get(key);
  if (!stored) return null;
  return isStoredArtifact(stored) ? stored : wrapLegacyValue(stored);
}

// ---------------------------------------------------------------------------
// Source resolvers — thin wrappers over the existing Sefaria helpers. Each
// writes the template vars its producer's user prompt interpolates, byte-equal
// to the strings the legacy route bodies built.
// ---------------------------------------------------------------------------

async function fetchChapterText(book: string, chapter: string) {
  let text: Awaited<ReturnType<typeof sefaria.getText>>;
  try {
    text = await sefaria.getText(`${book} ${chapter}`);
  } catch (e) {
    throw new TanachSourceError(502, `Sefaria fetch failed: ${(e as Error).message}`);
  }
  if (text.error) throw new TanachSourceError(404, text.error);
  return text;
}

/** The RAW verse path component, exactly as the route received it. The legacy
 *  routes used the raw string everywhere (source refs, prompts, output keys),
 *  so '007' stays '007' — numerifying here would split the output key from the
 *  source key/prompt for zero-padded inputs. */
function verseOf(markInput: unknown): string {
  const v = (markInput as { verse?: string | number } | null)?.verse;
  return v === undefined ? '' : String(v);
}

/** The chapter's verses, numbered, for the events prompt. */
const chapterVersesResolver: SourceResolver<TanachRunCtx> = async ({
  out,
  tractate: book,
  page: chapter,
}) => {
  const text = await fetchChapterText(book, chapter);
  const he = asVerses(text.he);
  const en = asVerses(text.text);
  const verses = Array.from({ length: Math.max(he.length, en.length) }, (_, i) => ({
    n: i + 1,
    he: he[i] ?? '',
    en: en[i] ?? '',
  }));
  const versesText = versesForPrompt(verses);
  out.vars.ref = `${book} ${chapter}`;
  out.vars.max_verse = verses.length;
  out.vars.verses_text = versesText;
  recordSource(out, 'chapter-verses', versesText);
};

interface NumberedVerse {
  chapter: number;
  verse: number;
  text: string;
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function versesInRange(range: ParshaRange): Promise<NumberedVerse[]> {
  const chapters = await Promise.all(
    Array.from({ length: range.endChapter - range.startChapter + 1 }, (_, index) => {
      const chapter = range.startChapter + index;
      return fetchChapterText(range.book, String(chapter)).then((text) => ({ chapter, text }));
    }),
  );
  const verses: NumberedVerse[] = [];
  for (const { chapter, text } of chapters) {
    const en = asVerses(text.text);
    const he = asVerses(text.he);
    const first = chapter === range.startChapter ? range.startVerse : 1;
    const last = chapter === range.endChapter ? range.endVerse : Math.max(en.length, he.length);
    for (let verse = first; verse <= last; verse++) {
      const body = plainText(en[verse - 1] || he[verse - 1] || '');
      if (body) verses.push({ chapter, verse, text: body });
    }
  }
  return verses;
}

const parshaVersesResolver: SourceResolver<TanachRunCtx> = async ({ out, markInput }) => {
  const input = markInput as { parshaRef?: string; parshaName?: string };
  const range = input.parshaRef ? parseParshaRef(input.parshaRef) : null;
  if (!range) throw new TanachSourceError(404, 'Unresolvable parsha range');
  const verses = await versesInRange(range);
  if (!verses.length) throw new TanachSourceError(404, 'No parsha text found');
  const versesText = verses.map((v) => `${v.chapter}:${v.verse}. ${v.text}`).join('\n');
  out.vars.parsha_name = input.parshaName ?? '';
  out.vars.parsha_ref = input.parshaRef ?? '';
  out.vars.verses_text = versesText;
  out.vars.chapter_lengths = JSON.stringify(
    Object.fromEntries(
      [...new Set(verses.map((verse) => verse.chapter))].map((chapter) => [
        chapter,
        Math.max(
          ...verses.filter((verse) => verse.chapter === chapter).map((verse) => verse.verse),
        ),
      ]),
    ),
  );
  recordSource(out, 'parsha-verses', versesText);
};

interface ThreadSource {
  ref: string;
  label: string;
  text: string;
}

/** The markInput shape every per-section parsha producer receives: the route
 *  spreads the anchored flow section over the parsha identity. */
interface ParshaSectionInput {
  parshaName?: string;
  parshaRef?: string;
  titleEn?: string;
  startChapter?: number;
  startVerse?: number;
  endChapter?: number;
  endVerse?: number;
}

/** Resolve + bound-check one flow section against its parsha, then fetch its
 *  verse text — the shared front half of the section and thread resolvers. */
async function resolveSectionPassage(input: ParshaSectionInput): Promise<{
  parsha: ParshaRange;
  sectionRange: ParshaRange;
  sectionRef: string;
  verses: NumberedVerse[];
  versesText: string;
}> {
  const parsha = input.parshaRef ? parseParshaRef(input.parshaRef) : null;
  const section = {
    startChapter: Number(input.startChapter),
    startVerse: Number(input.startVerse),
    endChapter: Number(input.endChapter),
    endVerse: Number(input.endVerse),
  };
  if (!parsha || !sectionInParsha(parsha, section)) {
    throw new TanachSourceError(404, 'Unresolvable parsha section');
  }
  const sectionRange: ParshaRange = { book: parsha.book, ...section };
  const sectionRef = formatParshaRange(parsha.book, sectionRange);
  const verses = await versesInRange(sectionRange);
  if (!verses.length) throw new TanachSourceError(404, 'No section text found');
  const versesText = verses.map((v) => `${v.chapter}:${v.verse}. ${v.text}`).join('\n');
  return { parsha, sectionRange, sectionRef, verses, versesText };
}

/** The close-reading producer's input: just the section's own verses (no
 *  source packet — the deep dive stays on p'shat; sources join at the thread). */
const parshaSectionVersesResolver: SourceResolver<TanachRunCtx> = async ({ out, markInput }) => {
  const input = markInput as ParshaSectionInput;
  const { sectionRef, versesText } = await resolveSectionPassage(input);
  out.vars.parsha_name = input.parshaName ?? '';
  out.vars.parsha_ref = input.parshaRef ?? '';
  out.vars.section_title = input.titleEn ?? '';
  out.vars.section_ref = sectionRef;
  out.vars.verses_text = versesText;
  recordSource(out, 'parsha-section-verses', versesText);
};

const parshaThreadResolver: SourceResolver<TanachRunCtx> = async ({ out, markInput }) => {
  const input = markInput as ParshaSectionInput;
  const { parsha, sectionRef, verses, versesText } = await resolveSectionPassage(input);
  const sefariaSectionRef = sectionRef.replace('–', '-');

  const commentaryAnchors = [
    verses[0],
    verses[Math.floor(verses.length / 2)],
    verses.at(-1),
  ].filter(
    (verse, index, all): verse is NumberedVerse =>
      !!verse &&
      all.findIndex(
        (candidate) => candidate?.chapter === verse.chapter && candidate.verse === verse.verse,
      ) === index,
  );
  const [commentaryGroups, talmud, midrash] = await Promise.all([
    Promise.all(
      commentaryAnchors.map(async (anchor) => ({
        anchor,
        commentaries: await fetchVerseCommentaries(
          parsha.book,
          String(anchor.chapter),
          String(anchor.verse),
        ).catch(() => []),
      })),
    ),
    fetchPassages(sefariaSectionRef, 'Talmud', 4, true).catch(() => ({ count: 0, passages: [] })),
    fetchPassages(sefariaSectionRef, 'Midrash', 4).catch(() => ({ count: 0, passages: [] })),
  ]);
  const sources: ThreadSource[] = [
    ...commentaryGroups.flatMap(({ anchor, commentaries }) =>
      commentaries.slice(0, 2).map((commentary) => ({
        ref: `${commentary.en} on ${parsha.book} ${anchor.chapter}:${anchor.verse}`,
        label: `${commentary.en} · ${anchor.chapter}:${anchor.verse}`,
        text: plainText(
          (commentary.enText.length ? commentary.enText : commentary.he).join(' '),
        ).slice(0, 900),
      })),
    ),
    ...talmud.passages.map((passage) => ({
      ref: passage.ref,
      label: passage.ref,
      text: plainText(passage.en || passage.he).slice(0, 900),
    })),
    ...midrash.passages.map((passage) => ({
      ref: passage.ref,
      label: passage.ref,
      text: plainText(passage.en || passage.he).slice(0, 900),
    })),
  ].filter((source) => source.ref && source.text);
  const unique = [...new Map(sources.map((source) => [source.ref, source])).values()].slice(0, 10);
  const sourcesText = unique.length
    ? unique
        .map(
          (source, index) =>
            `[S${index + 1}] REF: ${source.ref}\nSOURCE: ${source.label}\n${source.text}`,
        )
        .join('\n\n')
    : 'No linked traditional sources were available. Build the idea from the Torah passage alone.';

  out.vars.parsha_name = input.parshaName ?? '';
  out.vars.parsha_ref = input.parshaRef ?? '';
  out.vars.section_title = input.titleEn ?? '';
  out.vars.section_ref = sectionRef;
  out.vars.verses_text = versesText;
  out.vars.sources_text = sourcesText;
  out.vars.source_refs = JSON.stringify(unique.map((source) => source.ref));
  recordSource(out, 'parsha-thread-material', `${versesText}\n\n${sourcesText}`);
};

/** The [start..end] verse slice + header for the note prompt. */
const sectionVersesResolver: SourceResolver<TanachRunCtx> = async ({
  out,
  tractate: book,
  page: chapter,
  markInput,
}) => {
  const mi = markInput as { start: number; end: number; label: string };
  const text = await fetchChapterText(book, chapter);
  const en = asVerses(text.text);
  const last = Math.min(mi.end, en.length);
  const slice: string[] = [];
  for (let n = mi.start; n <= last; n++) {
    slice.push(`${n}. ${(en[n - 1] ?? '').replace(/<[^>]+>/g, '').trim()}`);
  }
  const ref =
    mi.end > mi.start
      ? `${book} ${chapter}:${mi.start}-${mi.end}`
      : `${book} ${chapter}:${mi.start}`;
  out.vars.passage_header = `${ref}${mi.label ? ` — "${mi.label}"` : ''}`;
  out.vars.verses_text = slice.join('\n');
  recordSource(out, 'section-verses', out.vars.verses_text as string);
};

/** The focal verse's text (best-effort — optional context, '' on failure). */
const verseTextResolver: SourceResolver<TanachRunCtx> = async ({
  out,
  tractate: book,
  page: chapter,
  markInput,
}) => {
  const verse = verseOf(markInput);
  let verseText = '';
  try {
    const t = await sefaria.getText(`${book} ${chapter}:${verse}`);
    verseText = (asVerses(t.text)[0] || asVerses(t.he)[0] || '').replace(/<[^>]+>/g, '').trim();
  } catch {
    /* verse text is optional context */
  }
  out.vars.ref = `${book} ${chapter}:${verse}`;
  out.vars.verse_text = verseText;
  recordSource(out, 'verse-text', verseText);
};

/** The verse's classic commentaries — reuses the commentary drawer's cache
 *  (commentary:v1:*) when warm, exactly as the legacy route did. */
const commentariesResolver: SourceResolver<TanachRunCtx> = async ({
  ctx: rc,
  out,
  tractate: book,
  page: chapter,
  markInput,
}) => {
  const verse = verseOf(markInput);
  const cc = await rc.env.CACHE.get(`commentary:v1:${book}:${chapter}:${verse}`);
  const commentaries: VerseCommentary[] = cc
    ? (JSON.parse(cc).commentaries as VerseCommentary[])
    : await fetchVerseCommentaries(book, chapter, String(verse));
  if (commentaries.length < 2) {
    throw new TanachSourceError(404, 'Not enough commentary to synthesize');
  }
  const ctext = commentaries
    .map(
      (cm) =>
        `${cm.en}: ${cm.he
          .join(' ')
          .replace(/<[^>]+>/g, '')
          .slice(0, 600)}`,
    )
    .join('\n\n');
  out.vars.commentators_text = ctext;
  recordSource(out, 'commentaries', ctext);
};

/** The verse's midrash excerpts — reuses the midrash drawer's SOURCE cache
 *  (midrash:v1:*, which stays on direct KV) when warm, as the legacy route did. */
const midrashPassagesResolver: SourceResolver<TanachRunCtx> = async ({
  ctx: rc,
  out,
  tractate: book,
  page: chapter,
  markInput,
}) => {
  const verse = verseOf(markInput);
  let passages: SourcePassage[];
  const cm = await rc.env.CACHE.get(`midrash:v1:${book}:${chapter}:${verse}`);
  if (cm) {
    passages = JSON.parse(cm).passages as SourcePassage[];
  } else {
    try {
      passages = (await fetchPassages(`${book} ${chapter}:${verse}`, 'Midrash', 14)).passages;
    } catch (e) {
      throw new TanachSourceError(502, `Links fetch failed: ${(e as Error).message}`);
    }
  }
  if (passages.length < 2) {
    throw new TanachSourceError(404, 'Not enough midrash to synthesize');
  }
  const mtext = passages
    .map((p) => p.he || p.en)
    .filter(Boolean)
    .join('\n\n');
  out.vars.midrash_text = mtext;
  recordSource(out, 'midrash-passages', mtext);
};

const RESOLVE_PORTS: ResolveInputsPorts<TanachRunCtx, TanachEnrichmentDef, TanachMarkDef> = {
  sources: {
    'chapter-verses': chapterVersesResolver,
    'parsha-verses': parshaVersesResolver,
    'parsha-section-verses': parshaSectionVersesResolver,
    'parsha-thread-material': parshaThreadResolver,
    'section-verses': sectionVersesResolver,
    'verse-text': verseTextResolver,
    commentaries: commentariesResolver,
    'midrash-passages': midrashPassagesResolver,
  },
  defaultSource: 'chapter-verses',
  // Producer-to-producer deps: only the four runProducer-backed producers
  // exist; nothing declares {enrichment}/{mark} deps today, but the lookups
  // are real so the recursion closes through core if one ever does.
  loadEnrichmentDef: async (_rc, id) =>
    id === 'note' ||
    id === 'overview' ||
    id === 'parsha-overview' ||
    id === 'parsha-section' ||
    id === 'parsha-thread' ||
    id === 'geography' ||
    id === 'tidbit' ||
    id === 'synthesis' ||
    id === 'midrash-synthesis'
      ? enrichRunDefOf(id)
      : null,
  loadMarkDef: async (_rc, id) => (id === 'events' ? markRunDefOf(id) : null),
  runEnrichment: (rc, def, book, chapter, markInput, bypassCache, parentChain) =>
    runProducer(RUN_PORTS, rc, 'enrich', def, book, chapter, markInput, {
      bypassCache,
      lang: 'en',
      parentChain,
    }),
  runMark: (rc, def, book, chapter, bypassCache) =>
    runProducer(RUN_PORTS, rc, 'mark', def, book, chapter, undefined, {
      bypassCache,
      lang: 'en',
    }),
};

// ---------------------------------------------------------------------------
// The run ports.
// ---------------------------------------------------------------------------

/** Minimal {{var}} template rendering — the tanach prompts only interpolate
 *  scalar vars the resolvers set (no array/anchors formatting like talmud's). */
function renderTanachTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null) return '';
    return typeof v === 'string' ? v : String(v);
  });
}

const RUN_PORTS: RunProducerPorts<TanachRunCtx, TanachEnrichmentDef, TanachMarkDef> = {
  cacheRead: (rc, key) => readArtifactOrLegacy(rc.env, key),
  // Writes go through the store's put (the human-edit guard chokepoint), with
  // the legacy semantics: plain JSON, no TTL.
  cacheWrite: async (rc, key, value) => {
    await tanachArtifactStore(rc.env).put(key, value);
  },
  markKey: (def, book, chapter, lang) =>
    TANACH_KEY_SCHEME.key(keyInfoOf(def, 'mark'), { unit: { work: book, unit: chapter }, lang }),
  enrichmentKey: (def, instanceId, book, chapter, _qualifier, _lang) =>
    TANACH_KEY_SCHEME.key(
      keyInfoOf(def, 'enrich'),
      enrichmentAddress(def.id, instanceId, book, chapter),
    ),
  // Content hash of the generation inputs — stamped on fresh enrichment writes
  // (StoredArtifact.recipe_hash) so staleness is detectable later.
  enrichmentRecipeHash: (def) =>
    recipeHash({
      extractor: {
        system_prompt: def.system_prompt,
        user_prompt_template: def.user_prompt_template,
        output_schema: def.output_schema,
        max_tokens: def.max_tokens,
        temperature: def.temperature,
      },
    }),
  sectionRange: (def, markInput) => enrichmentSectionRange(def.id, markInput),
  resolveInputs: (rc, dependencies, book, chapter, markInput, bypassCache, parentChain) =>
    resolveInputs(
      RESOLVE_PORTS,
      rc,
      dependencies as ReadonlyArray<RunDependency> | undefined,
      book,
      chapter,
      markInput,
      bypassCache,
      parentChain,
    ),
  renderTemplate: renderTanachTemplate,
  // The mark LLM call — the exact runLLM options the legacy eventSections
  // passed (default model chain, max_tokens 900, temperature 0.2, strict
  // schema, tag 'tanach:events').
  markLLM: async (rc, a) => {
    const ext = a.def.extractor;
    const systemPrompt = renderTanachTemplate(a.sysTpl, a.vars);
    const userPrompt = renderTanachTemplate(a.usrTpl, a.vars);
    const result = await runLLM(rc.env, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: ext.max_tokens,
      temperature: ext.temperature,
      response_format: { type: 'json_schema', json_schema: ext.output_schema },
      tag: ext.tag,
    });
    return { result, systemPrompt, userPrompt };
  },
  // The enrichment LLM call — knobs per producer, exactly as the legacy
  // sectionNote / synthesize / midrashSynthesis functions passed them.
  enrichmentLLM: async (rc, a) => {
    const def = a.def;
    return runLLM(rc.env, {
      messages: [
        { role: 'system', content: a.systemPrompt },
        { role: 'user', content: a.userPrompt },
      ],
      max_tokens: def.max_tokens,
      temperature: def.temperature,
      response_format: { type: 'json_schema', json_schema: def.output_schema },
      tag: def.tag,
    });
  },
  runChecks: async (_rc, a) => {
    if (a.def.id === 'parsha-overview') {
      const range = parseParshaRef(String(a.inputs.vars.parsha_ref ?? ''));
      const parsed = (a.parsed ?? {}) as Record<string, unknown>;
      if (!range) {
        return { parsed, issues: [{ severity: 'hard', message: 'Invalid parsha range' }] };
      }
      let chapterLengths: Record<string, number> = {};
      try {
        chapterLengths = JSON.parse(String(a.inputs.vars.chapter_lengths ?? '{}')) as Record<
          string,
          number
        >;
      } catch {
        // Missing internal source metadata rejects all generated anchors below.
      }
      const verseExists = (chapter: number, verse: number) => {
        const lastVerse = Number(chapterLengths[String(chapter)] ?? 0);
        return Number.isInteger(verse) && verse >= 1 && verse <= lastVerse;
      };
      const flow = (Array.isArray(parsed.flow) ? parsed.flow : [])
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          startChapter: Number(item.startChapter),
          startVerse: Number(item.startVerse),
          endChapter: Number(item.endChapter),
          endVerse: Number(item.endVerse),
          kind: String(item.kind) as ParshaSectionKind,
          titleEn: String(item.titleEn ?? '').trim(),
          titleHe: String(item.titleHe ?? '').trim(),
          summaryEn: String(item.summaryEn ?? '').trim(),
          summaryHe: String(item.summaryHe ?? '').trim(),
        }))
        .filter(
          (item) =>
            (PARSHA_KINDS as readonly string[]).includes(item.kind) &&
            item.titleEn &&
            verseExists(item.startChapter, item.startVerse) &&
            verseExists(item.endChapter, item.endVerse) &&
            sectionInParsha(range, item),
        )
        .sort(
          (left, right) =>
            left.startChapter - right.startChapter || left.startVerse - right.startVerse,
        )
        .slice(0, 9);
      const landmarks = (Array.isArray(parsed.landmarks) ? parsed.landmarks : [])
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          chapter: Number(item.chapter),
          verse: Number(item.verse),
          labelEn: String(item.labelEn ?? '').trim(),
          labelHe: String(item.labelHe ?? '').trim(),
        }))
        .filter(
          (item) =>
            item.labelEn && pointInParsha(range, item) && verseExists(item.chapter, item.verse),
        )
        .slice(0, 6);
      const normalized = {
        ...parsed,
        titleEn: String(parsed.titleEn ?? '').trim(),
        titleHe: String(parsed.titleHe ?? '').trim(),
        overviewEn: String(parsed.overviewEn ?? '').trim(),
        overviewHe: String(parsed.overviewHe ?? '').trim(),
        flow,
        landmarks,
        terms: sanitizeParshaTerms(parsed.terms),
      };
      const issues =
        flow.length >= 3
          ? []
          : [{ severity: 'hard', message: 'Parsha flow has fewer than three anchored units' }];
      return { parsed: normalized, issues };
    }
    if (a.def.id === 'parsha-section') {
      const parsed = (a.parsed ?? {}) as Record<string, unknown>;
      const normalized = {
        ...parsed,
        titleEn: String(parsed.titleEn ?? '').trim(),
        titleHe: String(parsed.titleHe ?? '').trim(),
        en: String(parsed.en ?? '').trim(),
        he: String(parsed.he ?? '').trim(),
        terms: sanitizeParshaTerms(parsed.terms),
      };
      const issues =
        normalized.en || normalized.he
          ? []
          : [{ severity: 'hard', message: 'Parsha close reading has no prose' }];
      return { parsed: normalized, issues };
    }
    if (a.def.id === 'parsha-thread') {
      const parsed = (a.parsed ?? {}) as Record<string, unknown>;
      let allowed = new Set<string>();
      try {
        allowed = new Set(JSON.parse(String(a.inputs.vars.source_refs ?? '[]')) as string[]);
      } catch {
        // Bad internal source metadata means no citations survive.
      }
      const sources = (Array.isArray(parsed.sources) ? parsed.sources : [])
        .filter(
          (source): source is Record<string, unknown> => !!source && typeof source === 'object',
        )
        .map((source) => ({
          ref: String(source.ref ?? '').trim(),
          labelEn: String(source.labelEn ?? '').trim(),
          labelHe: String(source.labelHe ?? '').trim(),
          contributionEn: String(source.contributionEn ?? '').trim(),
          contributionHe: String(source.contributionHe ?? '').trim(),
        }))
        .filter((source) => allowed.has(source.ref))
        .slice(0, 4);
      const normalized = {
        ...parsed,
        titleEn: String(parsed.titleEn ?? '').trim(),
        titleHe: String(parsed.titleHe ?? '').trim(),
        questionEn: String(parsed.questionEn ?? '').trim(),
        questionHe: String(parsed.questionHe ?? '').trim(),
        insightEn: String(parsed.insightEn ?? '').trim(),
        insightHe: String(parsed.insightHe ?? '').trim(),
        dvarEn: String(parsed.dvarEn ?? '').trim(),
        dvarHe: String(parsed.dvarHe ?? '').trim(),
        sources,
      };
      const issues =
        normalized.dvarEn || normalized.dvarHe
          ? []
          : [{ severity: 'hard', message: 'Parsha thread has no dvar Torah' }];
      return { parsed: normalized, issues };
    }
    return { parsed: a.parsed, issues: [] };
  },
  lintGate: async () => true,
  costStamp: (model, usage, lang, cacheVersion) => {
    const u = usage as LLMUsage | null | undefined;
    const { input, output } = normalizeUsage(u);
    const { costInUsd, costOutUsd } = costSplitUsd(model, u);
    const stamp: CostStamp = {
      billedUsd: u && typeof u.cost === 'number' ? u.cost : null,
      estimatedUsd: costUsd(model, u),
      costInUsd,
      costOutUsd,
      tokensIn: input,
      tokensOut: output,
      lang,
      cacheVersion,
      computedAt: Date.now(),
    };
    return stamp;
  },
  // The existing usage:v1 ledger, fed the same entry the legacy routes wrote
  // (fire-and-forget via waitUntil so it never blocks the response).
  recordUsage: (rc, args) => {
    const usage = args.result.usage as LLMUsage | null | undefined;
    const model = args.result.model ?? '';
    const billed = usage && typeof usage.cost === 'number' ? usage.cost : null;
    // The in/out split is from the price table (the provider bills one total) —
    // it's the content-in vs content-out proportion the usage page surfaces.
    const { costInUsd, costOutUsd } = costSplitUsd(model, usage);
    const entry: UsageEntry = {
      ts: Date.now(),
      ref: rc.ref,
      producer: args.id,
      model,
      tokensIn: usage?.prompt_tokens ?? 0,
      tokensOut: usage?.completion_tokens ?? 0,
      // Prefer the provider's BILLED cost; fall back to the price-table estimate.
      costUsd: billed ?? costUsd(model, usage),
      costInUsd,
      costOutUsd,
    };
    rc.ctx.waitUntil(recordUsageEntry(rc.env.CACHE, entry));
  },
  hooks: {
    computedMark: async (_rc, def) => {
      throw new Error(`mark ${def.id}: tanach has no computed marks`);
    },
    // The events producer's legacy output normalization, byte-for-byte the
    // filtering the old eventSections wrapper applied: in-range integer verse,
    // non-empty label, 40-char caps, verse order.
    markPostParse: async (_rc, a) => {
      if (a.def.id !== 'events' || !a.parsed) return a.parsed;
      // The old eventSections wrapper caught ANY malformed-but-valid-JSON
      // output (e.g. sections as an object) and degraded to sections: [] —
      // a 502 here would turn a recoverable model quirk into a hard failure.
      try {
        const maxVerse = Number(a.vars.max_verse ?? 0);
        const p = a.parsed as { sections?: EventSection[] };
        const raw = Array.isArray(p.sections) ? p.sections : [];
        const sections = raw
          .filter(
            (s) =>
              Number.isInteger(s.verse) && s.verse >= 1 && s.verse <= maxVerse && (s.en || s.he),
          )
          .map((s) => ({
            verse: s.verse,
            en: String(s.en ?? '')
              .trim()
              .slice(0, 40),
            he: String(s.he ?? '')
              .trim()
              .slice(0, 40),
          }))
          .sort((x, y) => x.verse - y.verse);
        return { sections };
      } catch {
        return { sections: [] };
      }
    },
    enrichmentPreResolve: async () => null,
    enrichmentPostResolve: async () => ({}),
    // Reject an empty-but-valid-JSON generation so runProducer skips the cache
    // write (the cache-gate only checks parse_error, so an all-empty result
    // would otherwise be pinned and served forever). Throwing here means the
    // next request regenerates. Scoped to overview — the per-verse producers
    // gate their emptiness upstream (source resolvers raise 404 when there's
    // nothing to synthesize).
    enrichmentPostParse: (_rc, a) => {
      // Overview-like producers reject an empty-but-valid
      // generation so it isn't pinned (truncated JSON parses to blank fields).
      if (
        !['overview', 'tidbit', 'parsha-overview', 'parsha-section', 'parsha-thread'].includes(
          a.def.id,
        ) ||
        a.parse_error ||
        !a.parsed
      )
        return;
      const p = a.parsed as {
        titleEn?: string;
        en?: string;
        he?: string;
        overviewEn?: string;
        overviewHe?: string;
        dvarEn?: string;
        dvarHe?: string;
      };
      const empty =
        !String(p.titleEn ?? '').trim() &&
        !String(p.en ?? '').trim() &&
        !String(p.he ?? '').trim() &&
        !String(p.overviewEn ?? '').trim() &&
        !String(p.overviewHe ?? '').trim() &&
        !String(p.dvarEn ?? '').trim() &&
        !String(p.dvarHe ?? '').trim();
      if (empty) throw new Error(`${a.def.id}: empty generation (not caching)`);
    },
  },
};

// ---------------------------------------------------------------------------
// Route entry points — synchronous runProducer calls (no queue: that a
// queue-less app runs the identical core function IS the proof).
// ---------------------------------------------------------------------------

export async function runTanachEvents(
  rc: TanachRunCtx,
  book: string,
  chapter: string,
): Promise<StoredArtifact> {
  return runProducer(RUN_PORTS, rc, 'mark', markRunDefOf('events'), book, chapter, undefined, {
    bypassCache: false,
    lang: 'en',
  });
}

export async function runTanachEnrichment(
  rc: TanachRunCtx,
  id:
    | 'note'
    | 'overview'
    | 'parsha-overview'
    | 'parsha-section'
    | 'parsha-thread'
    | 'geography'
    | 'tidbit'
    | 'synthesis'
    | 'midrash-synthesis',
  book: string,
  chapter: string,
  /** The instance the enrichment is FOR. Its `id` field is the legacy key
   *  component (`${start}-${end}` / `${verse}`) — see enrichmentAddress. */
  markInput: Record<string, unknown> & { id: string },
): Promise<StoredArtifact> {
  return runProducer(RUN_PORTS, rc, 'enrich', enrichRunDefOf(id), book, chapter, markInput, {
    bypassCache: false,
    lang: 'en',
  });
}

/** Exposed for tests: proves the markInput `id` carrier survives instanceIdOf
 *  verbatim (digits + '-' pass slugId untouched), which is what makes the
 *  template keys byte-exact end-to-end. */
export { instanceIdOf };
