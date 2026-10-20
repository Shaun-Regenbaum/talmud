/** Offline screening of existing detector results. No identity assignment or database writes. */
import { createHash } from 'node:crypto';

export const VERSION = 'name-candidate-guards-v1';
const hash = (text) => createHash('sha256').update(text).digest('hex');
/** Exact normalization used by the existing mentions.mjs detector; no matching logic lives here. */
export function normalizeDetectorText(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[֑-ׇ]/g, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/(^|\s)ר['׳]\s*/g, '$1רבי ')
    .replace(/[.,:;?!"'״׳()[\]{}—–\-–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const cp = (text, end) => Array.from(text.slice(0, end)).length;

/** Inject the exact detector normalizer; require whole-source and per-word normalization to agree.
 * The returned offsets refer to the untouched source, including attached prefixes and punctuation.
 * A mismatch is unplaceable, never guessed from normalized string lengths. */
export function sourceWords(text, normalize) {
  const mapped = [];
  for (const match of text.matchAll(/\S+/gu)) {
    const words = normalize(match[0]).split(/\s+/u).filter(Boolean);
    for (const word of words) {
      mapped.push({
        word,
        start: cp(text, match.index),
        end: cp(text, match.index + match[0].length),
      });
    }
  }
  return mapped.map((m) => m.word).join(' ') === normalize(text) ? mapped : null;
}

/** Candidates are detector alternatives, never confirmed people. Each input hit survives as a
 * ready or held proposal. Even a single candidate retains the outside-registry alternative. */
export function screenSource(source, hits, normalize, provenance) {
  if (hash(source.text) !== source.sha256) throw Error('Source hash differs');
  for (const field of ['detectorSha256', 'registrySha256', 'slugSetSha256']) {
    if (!/^[a-f0-9]{64}$/.test(provenance[field] ?? '')) throw Error(`Missing ${field}`);
  }
  if (!source.edition || !source.provenance?.segment_id) throw Error('Source identity is missing');
  const raw = Array.from(source.text),
    mapped = sourceWords(source.text, normalize);
  const normalized = normalize(source.text).split(/\s+/u).filter(Boolean);
  return hits.map((hit) => {
    if (
      !Number.isInteger(hit.wordIdx) ||
      !Number.isInteger(hit.len) ||
      hit.wordIdx < 0 ||
      hit.len < 1 ||
      hit.wordIdx + hit.len > normalized.length
    )
      throw Error('Detector word range is invalid');
    if (normalized.slice(hit.wordIdx, hit.wordIdx + hit.len).join(' ') !== hit.surface)
      throw Error('Detector surface differs');
    const reasons = [];
    const first = mapped?.[hit.wordIdx],
      last = mapped?.[hit.wordIdx + hit.len - 1];
    const safe =
      mapped &&
      first &&
      last &&
      mapped[hit.wordIdx - 1]?.start !== first.start &&
      mapped[hit.wordIdx + hit.len]?.end !== last.end;
    const quote = safe ? raw.slice(first.start, last.end).join('') : null;
    const before = normalized.slice(Math.max(0, hit.wordIdx - 2), hit.wordIdx);
    const after = normalized.slice(hit.wordIdx + hit.len, hit.wordIdx + hit.len + 3);
    const nextRaw = safe ? raw.slice(last.end).join('') : '';
    if (!safe) reasons.push('normalization_not_reversible');
    if (hit.unlisted || !hit.slugs?.length) reasons.push('unlisted_name_pattern');
    if (hit.bareToken) reasons.push('single_word_may_not_name_a_person');
    if (before.at(-1) === 'בית') reasons.push('school_or_house_name');
    // A cited book followed by chapter/verse notation can look like a lone personal name.
    if (
      ['שמואל', 'מלכים', 'דברי הימים'].includes(hit.name) &&
      /^\s+[אב][׳’']?\s+[א-ת]{1,3}(?:[׳״'’"]|\s|$)/u.test(nextRaw)
    )
      reasons.push('possible_biblical_book_citation');
    // An observed verse formula, not a general claim that every occurrence of רבה is nonhuman.
    if (hit.name === 'רבה' && before.at(-1) === 'כי' && after[0] === 'וגו')
      reasons.push('ordinary_word_in_verse_formula');
    if (quote && /[:;.!?׃—–]/u.test(quote.replace(/[\p{P}\s]+$/u, '')))
      reasons.push('punctuation_splits_name');
    const anchor = safe
      ? {
          sourceId: source.source_id,
          edition: source.edition,
          segmentId: source.provenance.segment_id,
          ref: source.ref,
          sourceSha256: source.sha256,
          start: first.start,
          end: last.end,
          quote,
          offsetUnit: 'Unicode code points',
        }
      : null;
    const key = hash(
      JSON.stringify([
        source.edition,
        source.provenance.segment_id,
        source.sha256,
        safe ? first.start : null,
        safe ? last.end : null,
        ...(safe ? [] : [hit.wordIdx, hit.len]),
      ]),
    );
    return {
      version: VERSION,
      occurrenceKey: safe ? `occ-${key}` : null,
      proposalKey: `candidate:${key}`,
      authority: 'screening',
      decision: 'needs_review',
      status: reasons.length ? 'held' : 'candidate',
      anchor,
      source: {
        sourceId: source.source_id,
        ref: source.ref,
        edition: source.edition,
        segmentId: source.provenance.segment_id,
        sourceSha256: source.sha256,
      },
      detector: {
        ...provenance,
        wordIdx: hit.wordIdx,
        length: hit.len,
        normalizedSurface: hit.surface,
        matchedName: hit.name,
        attachedPrefix: hit.prefix ?? '',
      },
      candidates: [...new Set(hit.slugs ?? [])].map((registryId) => ({
        registryId,
        reason: 'The detector matched this registry spelling; the identity has not been checked.',
      })),
      alternatives: [
        {
          kind: 'outside_registry_or_nonperson',
          reason: 'A spelling match alone does not prove that this is a listed person.',
        },
      ],
      reviewReasons: reasons,
      acceptedIdentity: false,
      historicalIdentityResolved: false,
      acceptedEra: false,
      relationships: [],
    };
  });
}
