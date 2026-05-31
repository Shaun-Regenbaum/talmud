import { describe, it, expect } from 'vitest';
import { citationLink, continuationLink, linkLabel, type Link } from '../src/lib/context/link.ts';
import { dafCoord, coordForSeg, DAF_SEG } from '../src/lib/context/coord.ts';
import { formatContextForPrompt } from '../src/lib/context/select.ts';
import type { ContextItem } from '../src/lib/context/types.ts';

describe('citationLink — refs become a Link(relation: cites)', () => {
  it('returns null for no refs', () => {
    expect(citationLink(undefined)).toBeNull();
    expect(citationLink([])).toBeNull();
  });
  it('wraps refs as a cites link, targets preserved', () => {
    const refs = [dafCoord({ tractate: 'Pesachim', page: '50a' })];
    expect(citationLink(refs)).toEqual({ relation: 'cites', targets: refs });
  });
});

describe('continuationLink — the tractate-continuity edge', () => {
  it('is null when there is no next daf (edge of tractate / no continuation)', () => {
    expect(continuationLink(null)).toBeNull();
    expect(continuationLink(undefined)).toBeNull();
  });
  it('targets the next daf at whole-daf level (seg = DAF_SEG)', () => {
    const link = continuationLink({ tractate: 'Shabbat', page: '126a' });
    expect(link).toEqual({ relation: 'continues', targets: [{ tractate: 'Shabbat', page: '126a', seg: DAF_SEG }] });
    expect(linkLabel(link)).toBe('Shabbat 126a'); // daf-level coordLabel, no seg suffix
  });
});

describe('linkLabel — compact deduped targets, no relation word', () => {
  it('is empty for an empty/absent link', () => {
    expect(linkLabel(null)).toBe('');
    expect(linkLabel({ relation: 'cites', targets: [] })).toBe('');
  });
  it('daf-level and segment-level coords render distinctly', () => {
    const link: Link = {
      relation: 'cites',
      targets: [dafCoord({ tractate: 'Pesachim', page: '50a' }), coordForSeg({ tractate: 'Shabbat', page: '2a' }, 7)],
    };
    expect(linkLabel(link)).toBe('Pesachim 50a, Shabbat 2a:7');
  });
  it('dedupes repeated targets', () => {
    const c = dafCoord({ tractate: 'Pesachim', page: '50a' });
    expect(linkLabel({ relation: 'cites', targets: [c, { ...c }] })).toBe('Pesachim 50a');
  });
});

describe('formatContextForPrompt — citation fragment is byte-stable through the Link path', () => {
  it('renders "(cites Pesachim 50a)" exactly (the prompt the LLM sees)', () => {
    const item: ContextItem = {
      source: 'dafyomi:revach', sourceLabel: "Revach l'Daf", kind: 'revach', key: 'revach:a:1',
      title: { en: 'A contradiction is raised' }, body: { en: 'See the Gemara.' },
      segs: [], refs: [dafCoord({ tractate: 'Pesachim', page: '50a' })],
    };
    expect(formatContextForPrompt([item]))
      .toBe("## Revach l'Daf\n- [whole daf] A contradiction is raised: See the Gemara. (cites Pesachim 50a)");
  });
});
