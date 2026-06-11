import { describe, expect, it } from 'vitest';
import { dedupRabbiList } from '../../src/client/dafContext';

// List-identity dedup for daf rabbi lists (DafViewer.dafRabbis). Slug-first;
// Hebrew-name fold (geresh title expanded) as the slugless fallback. Reproduces
// the Shabbat 21b report: 'Rabbi Yirmiyah'/'Rabbi Yirmeyah' and 'Rabbi Yose bar
// Avin'/'Rebbi Yose b. Rebbi Abun' rendered as distinct rabbis.

const mk = (name: string, nameHe: string, slug: string | null = null, homonyms?: number) => ({
  slug,
  name,
  nameHe,
  homonyms,
});

describe('dedupRabbiList — slug-first list identity', () => {
  it('collapses two name-variant instances with the same grounded slug', () => {
    const out = dedupRabbiList([
      mk('Rabbi Yirmiyah', "ר' ירמיה", 'rabbi-yirmeyah'),
      mk('Rabbi Yirmeyah', 'רבי ירמיה', 'rabbi-yirmeyah'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Rabbi Yirmiyah'); // first wins
  });

  it('collapses the geresh and full-title Hebrew spellings even when only one carries a slug', () => {
    // The reported daf's cached state: the LLM-form instance was ungrounded
    // (no slug) while the augmented full form carried one.
    const out = dedupRabbiList([
      mk('Rabbi Yose bar Avin', "ר' יוסי בר אבין", null),
      mk('Rebbi Yose b. Rebbi Abun', 'רבי יוסי בר אבין', 'rebbi-yose-b-rebbu-abun'),
    ]);
    expect(out).toHaveLength(1);
  });

  it('keeps genuine same-name homonyms apart when grounding gave them different slugs', () => {
    const out = dedupRabbiList([
      mk('Rav Kahana', 'רב כהנא', 'rav-kahana-(ii)'),
      mk('Rav Kahana', 'רב כהנא', 'rav-kahana-of-pum-nahara'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('does NOT fold a slugless entry into a slugged KNOWN HOMONYM (it may be another bearer)', () => {
    // The slugged entry was relationally pinned, but the name has several
    // registry bearers — the slugless (ambiguous) mention may be a different
    // Kahana, so both rows stay.
    const out = dedupRabbiList([
      mk('Rav Kahana', 'רב כהנא', 'rav-kahana-of-pum-nahara', 3),
      mk('Rav Kahana', 'רב כהנא', null, 3),
    ]);
    expect(out).toHaveLength(2);
  });

  it('the homonym guard works in either arrival order (slugless first)', () => {
    const out = dedupRabbiList([
      mk('Rav Kahana', 'רב כהנא', null, 3),
      mk('Rav Kahana', 'רב כהנא', 'rav-kahana-of-pum-nahara', 3),
    ]);
    expect(out).toHaveLength(2);
  });

  it('still folds slugless-into-slugged when the name is NOT a homonym', () => {
    // One registry bearer (homonyms absent/1): the slug identifies the one
    // rabbi both mentions refer to.
    const out = dedupRabbiList([
      mk('Rabbi Yirmeyah', 'רבי ירמיה', 'rabbi-yirmeyah'),
      mk('Rabbi Yirmiyah', "ר' ירמיה", null),
    ]);
    expect(out).toHaveLength(1);
  });

  it('two SLUGLESS same-Hebrew entries collapse even for a homonym name (indistinguishable)', () => {
    // Neither carries a slug — there is nothing to tell them apart, so one
    // honest row beats two identical ones.
    const out = dedupRabbiList([
      mk('Rav Kahana', 'רב כהנא', null, 3),
      mk('Rav Kahana', 'רב כהנא', null, 3),
    ]);
    expect(out).toHaveLength(1);
  });

  it('slugless duplicates collapse into ONE row even behind a slugged homonym owner', () => {
    // Slugged pin + two indistinguishable slugless mentions of the homonym
    // name → exactly two rows (the pin + one ambiguous), never three.
    const out = dedupRabbiList([
      mk('Rav Kahana', 'רב כהנא', 'rav-kahana-of-pum-nahara', 3),
      mk('Rav Kahana', 'רב כהנא', null, 3),
      mk('Rav Kahana', 'רב כהנא', null, 3),
    ]);
    expect(out).toHaveLength(2);
  });

  it('keeps different rabbis distinct (different names, no slugs)', () => {
    const out = dedupRabbiList([mk('Rava', 'רבא'), mk('Abaye', 'אביי')]);
    expect(out).toHaveLength(2);
  });

  it('falls back to the English name when there is no Hebrew form', () => {
    const out = dedupRabbiList([mk('Rashi', ''), mk('Rashi', ''), mk('Tosafot', '')]);
    expect(out).toHaveLength(2);
  });

  it('drops entries with no identity at all', () => {
    const out = dedupRabbiList([mk('', ''), mk('Rava', 'רבא')]);
    expect(out).toHaveLength(1);
  });
});
