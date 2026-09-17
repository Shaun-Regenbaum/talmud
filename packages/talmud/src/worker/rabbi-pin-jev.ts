/**
 * @fileoverview rabbi.identity.pin on Jev (TypeSafe System One) — pure pieces.
 *
 * The pin's job is a selection: the deterministic grounder found several
 * registry rabbis sharing a bare name and could not choose, so a model picks
 * the bearer or declines. That is exactly a Jev Choice over the candidate slugs
 * plus a `decline` option, with a probability per option instead of a
 * self-reported "high/medium/low". Two Nouls ride along in the same request
 * (does a textbook stam convention apply; is that conventional figure among the
 * candidates) — they cost a few tokens and give the decision a reason string.
 *
 * Registry duplicates: the hierarchy carries more than one node for some
 * people (`rabbi-oshaya` / `rabbi-oshaya-2`, `rabbi-yehoshua-b-hananyah` /
 * `rabbi-yehoshua-b-hananiah`). Offered both, Jev splits its probability
 * between them, which reads as an unsure pick for what is really a sure one.
 * `duplicateGroups` folds such nodes together BEFORE the decision, so the
 * threshold is applied to the person, not the node. The fold uses the
 * registry's explicit duplicate map (rabbi-duplicates.json), never a name
 * heuristic: rabbi-oshaya and rabbi-oshaya-2 look alike and are two people.
 *
 * Benchmarked on tests/fixtures/rabbi-pin-bench.json (see
 * tests/integration/rabbi-pin-bench.test.ts): the safety metric is
 * "confidently wrong" pins, which must stay at zero.
 */

import {
  type ChoiceAnswer,
  choice,
  mergeChoiceMass,
  type NoulAnswer,
  noul,
} from '@corpus/core/llm/jev';
import { canonicalSlug, type RabbiCandidateSummary } from './rabbi-graph';

export const DECLINE = 'decline';

/** Merged probability at/above which the pin overrides the honest "uncertain"
 *  verdict. Between the two it is a lean the card shows as "most likely"; below
 *  it the pin declines. Set from the benchmark, where every correct clear-case
 *  pin scored >= 0.6 and every registry-duplicate split merged to >= 0.7. */
export const PIN_HIGH = 0.85;
export const PIN_MEDIUM = 0.6;

/** The stam conventions the DeepSeek prompt carried, kept as data so the two
 *  paths judge by the same rules. */
export const STAM_CONVENTIONS: readonly string[] = [
  'A bare, unqualified sage name conventionally denotes one specific famous figure: an unqualified "Rabbi Shimon" in tannaitic material is Rabbi Shimon bar Yochai (student of Rabbi Akiva); "Rabbi Meir" and "Rabbi Yehuda" likewise denote the famous students of Rabbi Akiva; "Rabbi Eliezer" is Rabbi Eliezer ben Hyrcanus; "Rabbi Yehoshua" is Rabbi Yehoshua ben Chananya; a bare "Shmuel" among amoraim is Shmuel of Nehardea, the colleague of Rav; a bare "Rav Yehuda" is Rav Yehuda bar Yechezkel of Pumbedita; a bare "Rabbi Elazar" in the Babylonian Talmud is Rabbi Elazar ben Pedat. Apply only well-established conventions.',
  "If a candidate's teachers, students, or colleagues include rabbis named on the same daf, that is strong evidence for that candidate.",
  'A Tanna whose ruling is discussed by a named Amora is a normal pattern; do not reject a candidate merely because a later Amora is on the daf.',
];

export interface PinMention {
  name: string;
  nameHe: string;
  generation: string;
}

export function candidateDescription(c: RabbiCandidateSummary): string {
  const edges: string[] = [];
  if (c.teachers.length) edges.push(`teachers: ${c.teachers.slice(0, 6).join(', ')}`);
  if (c.students.length) edges.push(`students: ${c.students.slice(0, 6).join(', ')}`);
  if (c.colleagues.length) edges.push(`colleagues: ${c.colleagues.slice(0, 6).join(', ')}`);
  return (
    `${c.canonical} | generation: ${c.generation ?? 'unknown'}` +
    `${c.region ? ` | region: ${c.region}` : ''}` +
    `${edges.length ? ` | ${edges.join('; ')}` : ' | (no curated edges)'}`
  );
}

/** One Jev request: the mention + cast as state, a Choice over the candidate
 *  slugs (+ decline), and two Nouls that explain the pick. */
export function buildRabbiPinJevRequest(
  inst: PinMention,
  cands: readonly RabbiCandidateSummary[],
  cast: readonly string[],
  tractate: string,
  page: string,
) {
  const criteria: Record<string, string> = {};
  for (const c of cands) criteria[c.slug] = candidateDescription(c);
  criteria[DECLINE] =
    'None of the listed candidates: the figure this bare name conventionally denotes is NOT in the list, or the name is genuinely ambiguous here and no candidate is clearly the one meant.';
  return {
    state: {
      mention: {
        bare_name: inst.name,
        hebrew: inst.nameHe,
        tractate,
        daf: page,
        local_generation_read: inst.generation,
      },
      other_rabbis_named_on_this_daf: [...cast],
      conventions: [...STAM_CONVENTIONS],
    },
    questions: {
      which: choice(
        'A sage is named by a bare name in the Talmud passage described in `mention`. Several historical rabbis share this name; they are the options. Using the `conventions` (in order of weight: the classical stam convention for a bare name first, then shared teacher/student/colleague edges with `other_rabbis_named_on_this_daf`, then generation plausibility against `mention.local_generation_read`), which ONE figure does this bare name denote? Pick "decline" when the conventionally denoted figure is not among the options or the name is genuinely ambiguous here.',
        criteria,
      ),
      stam_applies: noul(
        'Does a well-established classical stam convention make the bare name in `mention.bare_name` denote ONE specific famous figure (see `conventions`)?',
        {
          true: 'Yes: this exact bare name has a textbook default bearer.',
          false:
            'No: this bare name has no single conventional bearer, or the name is a full name that needs no convention.',
        },
      ),
      conventional_bearer_listed: noul(
        'Is the figure that the classical stam convention would make `mention.bare_name` denote present among the candidate options (by canonical name, generation and edges)?',
        {
          true: 'Yes: one option is that conventional figure.',
          false:
            'No: the conventional figure is missing from the options, or no convention applies.',
        },
      ),
    },
  };
}

export type RabbiPinJevAnswers = {
  which: ChoiceAnswer;
  stam_applies: NoulAnswer;
  conventional_bearer_listed: NoulAnswer;
};

/** Group candidate slugs that are the same person under one representative,
 *  using the registry's explicit duplicate map (rabbi-duplicates.json). Only
 *  listed pairs are folded: name heuristics merged rabbi-oshaya with
 *  rabbi-oshaya-2, who are two different amoraim. Returns the `groups` shape
 *  mergeChoiceMass takes. */
export function duplicateGroups(cands: readonly RabbiCandidateSummary[]): Record<string, string[]> {
  const present = new Set(cands.map((c) => c.slug));
  const groups: Record<string, string[]> = {};
  for (const c of cands) {
    const rep = canonicalSlug(c.slug);
    if (rep === c.slug || !present.has(rep)) continue;
    (groups[rep] ??= []).push(c.slug);
  }
  return groups;
}

export interface RabbiPinDecision {
  /** A candidate slug, or null to decline. */
  slug: string | null;
  confidence: 'high' | 'medium' | 'low';
  /** Merged probability of the chosen option (or of `decline`). */
  probability: number;
  reason: string;
}

/** Turn Jev's answers into the pin's verdict. Duplicate registry nodes are
 *  merged first; the merged winner must clear PIN_MEDIUM to pin at all and
 *  PIN_HIGH to pin confidently. */
export function decideRabbiPin(
  answers: RabbiPinJevAnswers,
  cands: readonly RabbiCandidateSummary[],
): RabbiPinDecision {
  const groups = duplicateGroups(cands);
  const merged = mergeChoiceMass(answers.which, groups);
  const top = merged.choice;
  const p = merged.probabilities[top] ?? 0;
  const stam = answers.stam_applies.noul;
  const listed = answers.conventional_bearer_listed.noul;
  const mergedNote = Object.keys(groups).length
    ? ` (${Object.values(groups).reduce((n, g) => n + g.length, 0)} duplicate registry node${Object.values(groups).reduce((n, g) => n + g.length, 0) === 1 ? '' : 's'} merged)`
    : '';
  const stamNote =
    stam >= 0.7
      ? `a stam convention applies (${stam.toFixed(2)})${listed < 0.5 ? ' but its bearer is not listed' : ''}`
      : stam <= 0.3
        ? `no stam convention (${stam.toFixed(2)})`
        : `stam convention unclear (${stam.toFixed(2)})`;
  if (top === DECLINE || !cands.some((c) => c.slug === top)) {
    return {
      slug: null,
      confidence: 'low',
      probability: p,
      reason: `Declined: p=${p.toFixed(2)}; ${stamNote}${mergedNote}`,
    };
  }
  if (p < PIN_MEDIUM) {
    return {
      slug: top,
      confidence: 'low',
      probability: p,
      reason: `Lean only: ${top} p=${p.toFixed(2)}; ${stamNote}${mergedNote}`,
    };
  }
  return {
    slug: top,
    confidence: p >= PIN_HIGH ? 'high' : 'medium',
    probability: p,
    reason: `${top} p=${p.toFixed(2)}; ${stamNote}${mergedNote}`,
  };
}
