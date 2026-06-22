import { describe, expect, it } from 'vitest';
import { sectionsFromView, stripHtml } from '../src/client/howItWorks/example';

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<big><strong>מֵאֵימָתַי</strong></big> קוֹרִין')).toBe('מֵאֵימָתַי קוֹרִין');
    expect(stripHtml('The <i>Berakhot</i> tractate')).toBe('The Berakhot tractate');
  });
  it('decodes the common entities and trims', () => {
    expect(stripHtml('a&nbsp;&amp;&nbsp;b   ')).toBe('a & b');
  });
  it('is a no-op on plain text', () => {
    expect(stripHtml('plain text')).toBe('plain text');
  });
});

describe('sectionsFromView', () => {
  const view = {
    pieces: {
      argument: {
        parsed: {
          instances: [
            { startSegIdx: 0, endSegIdx: 4, fields: { title: 'Opening Mishnah' } },
            { startSegIdx: 5, endSegIdx: 7, fields: { title: 'Gemara’s first question' } },
          ],
        },
      },
    },
  };
  it('projects argument instances into numbered sections', () => {
    const secs = sectionsFromView(view);
    expect(secs).toHaveLength(2);
    expect(secs[0]).toEqual({ idx: 0, title: 'Opening Mishnah', startSeg: 0, endSeg: 4 });
    expect(secs[1].startSeg).toBe(5);
  });
  it('is empty (not a throw) when the argument piece is missing', () => {
    expect(sectionsFromView({})).toEqual([]);
    expect(sectionsFromView({ pieces: {} })).toEqual([]);
    expect(sectionsFromView(null)).toEqual([]);
  });
  it('falls back to a generic title when none is present', () => {
    const secs = sectionsFromView({
      pieces: { argument: { parsed: { instances: [{ startSegIdx: 2, endSegIdx: 2 }] } } },
    });
    expect(secs[0].title).toBe('Section 1');
  });
});
