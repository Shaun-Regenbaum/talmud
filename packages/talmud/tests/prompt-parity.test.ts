import { describe, expect, it } from 'vitest';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';

/**
 * Prompt parity — guards the full-parallel EN/HE prompts in code-marks.ts
 * against drift. The Hebrew prompts (system_prompt_he / user_prompt_template_he)
 * are authored as complete parallels of their English counterparts; this
 * suite enforces the invariants that keep the two in sync without forcing a
 * shared single source:
 *
 *   1. Template-variable parity — the {{...}} placeholders in the Hebrew
 *      prompts must be exactly the set used by the English prompts. Catches a
 *      dependency var renamed/added/dropped on one side only (the most likely
 *      real drift, since the runner feeds the same vars to both).
 *   2. JSON-key parity — the English JSON keys named in the prompt body must
 *      also appear in the Hebrew body. Hebrew keeps keys (and enum values) in
 *      English on purpose; this catches a key renamed on one side only.
 *
 * Enum VALUES are not asserted here: every rabbi enrichment carries a
 * `strict` output_schema, so the API enforces enum membership regardless of
 * prompt language. The schema is the source of truth for those.
 */

type LlmEnrichment = {
  id: string;
  extractor: {
    kind: string;
    system_prompt?: string;
    user_prompt_template?: string;
    system_prompt_he?: string;
    user_prompt_template_he?: string;
  };
};

const placeholders = (s: string): Set<string> => {
  const out = new Set<string>();
  for (const m of s.matchAll(/\{\{([^}]+)\}\}/g)) out.add(m[1].trim());
  return out;
};

// JSON object keys: an ASCII identifier in double quotes immediately followed
// by a colon. Matches `"bio":`, `"primaryStudyPlaces":` etc. Hebrew text in
// the prompt never matches (the char class is ASCII), and enum values are
// followed by `|` or `,` not `:`, so they're excluded.
const jsonKeys = (s: string): Set<string> => {
  const out = new Set<string>();
  for (const m of s.matchAll(/"([A-Za-z_][\w.]*)"\s*:/g)) out.add(m[1]);
  return out;
};

const sorted = (s: Set<string>): string[] => [...s].sort();

// Cover both the prose enrichments (CODE_ENRICHMENTS) and the structural
// extraction marks (CODE_MARKS) — both flow through the same runner, which
// picks system_prompt_he when lang=he, so both need EN/HE parity guarded.
const llmEnrichments = ([...CODE_ENRICHMENTS, ...CODE_MARKS] as unknown as LlmEnrichment[]).filter(
  (e) => e.extractor?.kind === 'llm',
);

const withHebrew = llmEnrichments.filter((e) => e.extractor.system_prompt_he);

describe('prompt parity (EN/HE)', () => {
  it('has at least the rabbi-family Hebrew prompts wired', () => {
    // Sanity: if this drops to 0 the wiring regressed.
    expect(withHebrew.length).toBeGreaterThanOrEqual(9);
  });

  for (const e of withHebrew) {
    describe(e.id, () => {
      const sys = e.extractor.system_prompt ?? '';
      const sysHe = e.extractor.system_prompt_he ?? '';
      const usr = e.extractor.user_prompt_template ?? '';
      const usrHe = e.extractor.user_prompt_template_he ?? '';

      it('Hebrew system prompt is present and distinct from English', () => {
        expect(sysHe.length).toBeGreaterThan(0);
        expect(sysHe).not.toBe(sys);
      });

      it('system-prompt template variables match', () => {
        expect(sorted(placeholders(sysHe))).toEqual(sorted(placeholders(sys)));
      });

      it('user-prompt template variables match', () => {
        // If one side defines a user template, both should.
        expect(sorted(placeholders(usrHe))).toEqual(sorted(placeholders(usr)));
      });

      it('English JSON keys all appear in the Hebrew prompt', () => {
        const enKeys = jsonKeys(sys);
        const heKeys = jsonKeys(sysHe);
        const missing = [...enKeys].filter((k) => !heKeys.has(k));
        expect(missing).toEqual([]);
      });
    });
  }
});
