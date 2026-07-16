/**
 * @fileoverview Fold a daf's statement spines into the list of PEOPLE who speak
 * on it: one entry per distinct named voice, carrying how much they say and
 * where. The #argument page renders this as the clickable "who speaks" strip
 * and uses the entries to focus one person's statements across every section —
 * the voice network read IN the argument structure rather than beside it.
 *
 * People come from each statement's `rabbiNames` (the RESOLVED names), not its
 * `speaker` label: on most dapim `speaker` is a descriptive move label
 * ("Gemara's question", "First answer (Stam)"), so only rabbiNames names real
 * people. Anonymous statements simply contribute nobody.
 *
 * Pure + DOM-free; classification (generation / collective voice) is injected
 * like buildDafVoiceGraph's, so this module stays free of the client tables.
 */
import type { VoiceClass } from './dafVoices';

export interface SpeakerStatement {
  /** Resolved named speakers of the statement; empty for anonymous moves. */
  rabbiNames?: string[];
}

export interface SectionStatementsInput {
  /** The section's daf index (as /api/statement-spine numbers them). */
  index: number;
  nodes: SpeakerStatement[];
}

export interface ArgumentPerson {
  name: string;
  generation?: string;
  collective: boolean;
  statementCount: number;
  /** Section indices where this person speaks, in first-appearance order. */
  sections: number[];
}

/**
 * Dedupe by trimmed name across every statement's rabbiNames. Ordered by
 * prominence: most statements first, first appearance breaking ties — the
 * strip reads like a cast list, main characters first. `classify` is called
 * once per name.
 */
export function buildArgumentPeople(
  sections: SectionStatementsInput[],
  classify: (name: string) => VoiceClass,
): ArgumentPerson[] {
  const byName = new Map<string, ArgumentPerson & { firstSeen: number }>();
  let seen = 0;
  for (const sec of sections) {
    for (const node of sec.nodes) {
      for (const raw of node.rabbiNames ?? []) {
        const name = (raw ?? '').trim();
        if (!name) continue;
        let person = byName.get(name);
        if (!person) {
          const cls = classify(name);
          person = {
            name,
            generation: cls.generation,
            collective: cls.collective,
            statementCount: 0,
            sections: [],
            firstSeen: seen,
          };
          byName.set(name, person);
        }
        seen += 1;
        person.statementCount += 1;
        if (!person.sections.includes(sec.index)) person.sections.push(sec.index);
      }
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.statementCount - a.statementCount || a.firstSeen - b.firstSeen)
    .map(({ firstSeen: _firstSeen, ...person }) => person);
}
