import { describe, expect, it } from 'vitest';
import { extractShastext } from '../src/lib/sefref/hebrewbooks/client';

// HebrewBooks wraps each column in <fieldset><legend>…</legend><div
// class="shastextN">…</div></fieldset>:  N=2 Gemara, N=3 Rashi, N=4 Tosafot.
// Its markup is well-formed on ordinary dapim but malformed at chapter
// boundaries — see extractShastext's doc comment. These fixtures mirror the
// real shapes observed on Chullin 26b (perek end) and 27a (perek start).

const wrap = (n: number, inner: string, legend = '') =>
  `<fieldset style="x"><legend>${legend}</legend><div class="shastext${n}">${inner}</div></fieldset>`;

describe('extractShastext — well-formed pages', () => {
  const html =
    wrap(2, 'משיקו במים אמר רבא', 'גמרא') +
    wrap(3, 'דברי רש"י', 'רש"י') +
    // Tosafot legitimately nests per-piece <div>s inside the block.
    `<fieldset><legend>תוספות</legend><div class="shastext4"><div style="m">piece one</div><div style="m">piece two</div></div></fieldset>`;

  it('extracts the Gemara column', () => {
    expect(extractShastext(html, 2)).toBe('משיקו במים אמר רבא');
  });

  it('extracts the Rashi column without leaking into other columns', () => {
    expect(extractShastext(html, 3)).toBe('דברי רש"י');
  });

  it('preserves Tosafot inner piece <div>s, stripping only the outer close', () => {
    expect(extractShastext(html, 4)).toBe(
      '<div style="m">piece one</div><div style="m">piece two</div>',
    );
  });

  it('returns empty when the block is absent', () => {
    expect(extractShastext(wrap(3, 'rashi only'), 2)).toBe('');
  });
});

describe('extractShastext — chapter END (unclosed Gemara <div>, e.g. Chullin 26b)', () => {
  // The shastext2 <div> is never closed by </div>; </fieldset> closes it.
  // Old behavior swallowed the following Rashi/Tosafot fieldsets.
  const html =
    `<fieldset><legend>גמרא</legend><div class="shastext2">GEMARA TEXT <div class="ghadran">הדרן עלך הכל שוחטין</div></fieldset>` +
    wrap(3, 'RASHI', 'רש"י') +
    `<fieldset><legend>תוספות</legend><div class="shastext4"><div>TOS</div></div></fieldset>` +
    `<div id="cpMstr_textsponsor">sponsor</div>`;

  it('captures only the Gemara up to the implicit fieldset close', () => {
    const out = extractShastext(html, 2);
    expect(out).toBe('GEMARA TEXT <div class="ghadran">הדרן עלך הכל שוחטין</div>');
  });

  it('does not leak Rashi or Tosafot into the Gemara block', () => {
    const out = extractShastext(html, 2);
    expect(out).not.toContain('RASHI');
    expect(out).not.toContain('TOS');
    expect(out).not.toContain('cpMstr');
  });

  it('still extracts Rashi and Tosafot correctly', () => {
    expect(extractShastext(html, 3)).toBe('RASHI');
    expect(extractShastext(html, 4)).toBe('<div>TOS</div>');
  });
});

describe('extractShastext — chapter START (stray leading </div>, e.g. Chullin 27a)', () => {
  // A stray </div> sits immediately after the opening tag. Old behavior hit
  // depth 0 on it and returned an empty Gemara column.
  const html =
    `<fieldset><legend>גמרא</legend><div class="shastext2"> </div><span class="gdropcap">השוחט </span> אחד בעוף שחיטתו כשרה</fieldset>` +
    wrap(3, 'RASHI', 'רש"י');

  it('skips the stray close and captures the Gemara that follows it', () => {
    const out = extractShastext(html, 2);
    expect(out).toContain('השוחט');
    expect(out).toContain('אחד בעוף שחיטתו כשרה');
  });

  it('does not return empty', () => {
    expect(extractShastext(html, 2).length).toBeGreaterThan(0);
  });
});
