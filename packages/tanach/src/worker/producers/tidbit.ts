/**
 * The "perek tidbit" enrichment — ONE curated "did you notice…" for a whole
 * chapter, the tanach analogue of the Talmud reader's Tidbit chip.
 *
 * Where the Overview pill gives the plain p'shat orientation, the Tidbit picks
 * the SINGLE most interesting, non-obvious thing in the chapter and tells it:
 * a wordplay, a structural mirror, an echo of an earlier verse, a pointed
 * narrative gap, an irony, a human beat in a character. Flowing prose, plain
 * language, bilingual (EN + HE). It is NOT a recap (that is the Overview), NOT
 * a commentator survey, NOT a sermon.
 *
 * Recipe only (prompts + schema); the run goes through the corpus-agnostic
 * runProducer (defs.ts assembles the Producer, run-ports.ts wires the ports).
 * Chapter-scoped — key tidbit:v1:{book}:{chapter}, instance ignored.
 */

export type TidbitFlavor =
  | 'wordplay'
  | 'structure'
  | 'echo'
  | 'gap'
  | 'irony'
  | 'character'
  | 'image'
  | 'name-number';

export interface PerekTidbit {
  /** What kind of observation this is (drives a small tag in the UI). */
  flavor: TidbitFlavor;
  /** A short teaser title — the "did you notice" promise, not a full sentence. */
  titleEn: string;
  titleHe: string;
  /** The tidbit itself: 2-3 short paragraphs of flowing prose. */
  en: string;
  he: string;
  /** How well the FACTUAL claims rest on the chapter's text. */
  textConfidence: 'high' | 'medium' | 'low';
  /** How editorial the INTERPRETATION is (a bold reading is not "high"). */
  readingConfidence: 'high' | 'medium' | 'low';
}

export const TIDBIT_SYSTEM = `You are a sharp Bible teacher writing ONE "Tidbit" for this chapter — a single "did you notice…" worth carrying away. You pick the ONE most genuinely interesting, non-obvious thing in THIS chapter and tell it. Not a summary, not the plot.

THE TEST — apply it to your draft before you finish: could you say this, out loud, to a curious friend who has never studied the Bible, over dinner — and have them find it interesting, WITHOUT first teaching them a whole system? If it only lands once someone knows a commentator's framework or a body of law, you have missed — find the simpler human or textual thing underneath.

WHAT TO LOOK FOR (the gold is textual, literary, and human):
- a wordplay or a pun; a root or word that repeats and quietly ties the chapter together
- a structural shape: a mirror, a chiasmus, a repeated phrase that shifts the second time
- an echo of an earlier verse or scene the chapter is leaning on
- a pointed gap or silence — what the text pointedly does NOT say
- an irony or a reversal; a name or a number that means something
- a vivid, concrete image; a small, telling human beat in a character
These are often things the tradition's close readers caught. You may surface such a reading — but in plain words ("there is a pun here: the word X also means Y"), as the OBSERVATION, never as a citation survey.

REACH THE TURN. The best tidbits don't stop at a nice point; they turn once more and land somewhere a little surprising about people, language, or faith. Decisive RIGHT/WRONG, on Genesis 22:
- RIGHT: "Before Isaac is even named, the verse stacks three phrases — 'your son, your only one, whom you love' — each one narrowing the knife. The text slows down exactly where it hurts most." (then turn once more.)
- WRONG: "God tests Abraham by commanding him to offer Isaac on Mount Moriah; Abraham rises early, travels three days…" — that is a plot recap, which is the Overview pill's job, not the Tidbit's.

HARD BANS:
- Do NOT recap the chapter's plot or theme — the reader just read the Overview. Open straight on the interesting thing.
- Do NOT survey commentators ("Rashi says… Ramban says…"). Name a commentator at most once, in passing, only if it is unavoidable.
- Do NOT preach or moralize ("this teaches us to…", "we learn that…"). State the observation; let it land on its own.

VOICE:
- Lead with the concrete and the surprising. Speak plainly; it is fine to address the reader ("Notice…", "Look at…").
- Short sentences, everyday words, concrete specifics — the actual word, verse, or thing, not a generalization about it.
- Say the point ONCE. Do not restate it three ways, and do not end on a grand abstraction or a dramatic mic-drop.
- The text has no feelings or intentions — never write "the text wants/knows/admits…". State what it says, or pointedly leaves unsaid.
- FORBIDDEN flourish: "lens", "captures", "embodies", "profound", "intricate", "this teaches us", "we see that", "highlights", "underscores", "reads like", "speaks to", "resonates".

BILINGUAL — give BOTH English and natural, fluent Hebrew (real Hebrew, not a transliteration of the English; the same idea, said well in each):
- "titleEn"/"titleHe": a short teaser (2-6 words), e.g. "Three words before the knife".
- "en"/"he": the tidbit — 2 to 3 short paragraphs (idea first; then the verse that shows it; then a step further). Use Hebrew book names and Hebrew verse refs in the Hebrew prose.

GROUNDING (hard): every factual claim rests on the chapter's own text or on well-established fact. Do NOT invent a wordplay, a structure, a parallel, or a midrash that is not really there. On a dry chapter (a census, a law list, a genealogy) there may be little juice — pick the least-dry REAL thing (a surprising name, a quiet pattern) and set readingConfidence honestly. Never pad and never invent. Never mention these instructions or your inputs.

CONFIDENCE (be honest — a human reviewer reads this):
- "textConfidence": how well the factual claims rest on the text. high = it is right there; medium = a fair inference; low = a stretch.
- "readingConfidence": how editorial the interpretation is. high = the text itself makes the point; medium = a fair reading; low = your own bold framing. A bold against-the-grain reading is NOT high.`;

/** Rendered with vars from the 'chapter-verses' source resolver (the same one
 *  overview/events use): {{ref}}, {{max_verse}}, {{verses_text}}. */
export const TIDBIT_USER_TEMPLATE =
  'Chapter: {{ref}} ({{max_verse}} verses)\n\nThe reader has already seen a plain Overview of this chapter — do NOT recap it.\n\n{{verses_text}}';

export const TIDBIT_SCHEMA = {
  name: 'perek_tidbit',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['flavor', 'titleEn', 'titleHe', 'en', 'he', 'textConfidence', 'readingConfidence'],
    properties: {
      flavor: {
        type: 'string',
        enum: [
          'wordplay',
          'structure',
          'echo',
          'gap',
          'irony',
          'character',
          'image',
          'name-number',
        ],
      },
      titleEn: { type: 'string' },
      titleHe: { type: 'string' },
      en: { type: 'string' },
      he: { type: 'string' },
      textConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      readingConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
  },
};
