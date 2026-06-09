/**
 * dafyomi.co.il serves a mix of UTF-8 and windows-1255 pages with NO charset
 * header. decodeDafyomiHtml must sniff: UTF-8 pages decode as UTF-8, and
 * windows-1255 Hebrew (the older pages, e.g. Berachos) must NOT mojibake into
 * U+FFFD — the "????" the user saw in the alignment cards.
 */

import { describe, expect, it } from 'vitest';
import { decodeDafyomiHtml } from '../src/lib/sefref/dafyomi/decode';

const REPLACEMENT = '�';

describe('decodeDafyomiHtml', () => {
  it('decodes UTF-8 Hebrew correctly (e.g. the Chullin pages)', () => {
    const utf8 = new TextEncoder().encode('<p>ארכובה knee-joint</p>');
    const s = decodeDafyomiHtml(utf8);
    expect(s).toContain('ארכובה');
    expect(s).not.toContain(REPLACEMENT);
  });

  it('decodes windows-1255 Hebrew without mojibake (e.g. the Berachos pages)', () => {
    // windows-1255: 0xE0..0xFA map to Hebrew Alef..Tav. אבת = E0 E1 FA.
    const win1255 = new Uint8Array([0x3c, 0x70, 0x3e, 0xe0, 0xe1, 0xfa, 0x3c, 0x2f, 0x70, 0x3e]); // <p>אבת</p>
    const s = decodeDafyomiHtml(win1255);
    expect(s).toBe('<p>אבת</p>');
    expect(s).not.toContain(REPLACEMENT);
  });

  it('the same windows-1255 bytes decoded as UTF-8 WOULD mojibake (guards the regression)', () => {
    const win1255 = new Uint8Array([0xe0, 0xe1, 0xfa]);
    // Non-fatal UTF-8 (what res.text() effectively does) produces replacement chars.
    expect(new TextDecoder('utf-8').decode(win1255)).toContain(REPLACEMENT);
    // The sniffing decoder recovers the Hebrew instead.
    expect(decodeDafyomiHtml(win1255)).toBe('אבת');
  });

  it('handles plain ASCII (English Revach pages) unchanged', () => {
    const ascii = new TextEncoder().encode('SUMMARY 1. Rav ruled...');
    expect(decodeDafyomiHtml(ascii)).toBe('SUMMARY 1. Rav ruled...');
  });

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    const u8 = new TextEncoder().encode('שלום');
    expect(decodeDafyomiHtml(u8.buffer)).toBe('שלום');
  });
});
