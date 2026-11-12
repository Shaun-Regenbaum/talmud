import { describe, expect, it } from 'vitest';
import { readImageSize, sizeCommentaryImages } from '../src/lib/daf-render/core/images';

// 1x1 PNG, then the same with the header edited to say 249 x 130.
const png = (w: number, h: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return btoa(String.fromCharCode(...b));
};

// The anchor marker sits just before each picture; most checks look at the picture alone.
const ANCHOR = /<span class="daf-img-anchor"[^>]*><\/span>/g;
const bare = (html: string) => html.replace(ANCHOR, '');

describe('readImageSize', () => {
  it('reads PNG width and height', () => {
    const bin = atob(png(249, 130));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    expect(readImageSize(bytes)).toEqual({ width: 249, height: 130 });
  });
  it('reads GIF width and height', () => {
    const bytes = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 100, 0, 50, 0]);
    expect(readImageSize(bytes)).toEqual({ width: 100, height: 50 });
  });
  it('reads JPEG width and height', () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 60, 0, 90, 3, 0, 0, 0]);
    expect(readImageSize(bytes)).toEqual({ width: 90, height: 60 });
  });
  it('returns null for unknown data', () => {
    expect(readImageSize(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
  });
});

const fit = (maxWidth: number) => ({ maxWidth, lineHeight: 14, charsPerLine: 1 });

describe('sizeCommentaryImages', () => {
  const html = (w: number, h: number) =>
    `before <img src="data:image/png;base64,${png(w, h)}"> after`;

  it('keeps a small image at its own size and tags it', () => {
    const out = sizeCommentaryImages(html(100, 50), fit(200));
    expect(out).toContain('class="daf-img" data-i="0" width="100" height="50"');
  });
  it('shrinks a wide image to the limit and keeps the ratio', () => {
    const out = sizeCommentaryImages(html(249, 130), fit(150));
    expect(out).toContain('width="150" height="78"');
  });
  it('leaves other tags and text alone', () => {
    const out = sizeCommentaryImages(html(100, 50), fit(200));
    expect(out.startsWith('before <span class="daf-img-anchor"')).toBe(true);
    expect(out.endsWith('> after')).toBe(true);
  });
  it('leaves an image it cannot measure alone', () => {
    const tag = '<img src="https://example.com/a.png">';
    expect(sizeCommentaryImages(tag, fit(200))).toBe(tag);
  });
  it('replaces existing size attributes instead of doubling them', () => {
    const tag = `<img width="999" src="data:image/png;base64,${png(100, 50)}" class="x">`;
    const out = bare(sizeCommentaryImages(tag, fit(200)));
    expect(out.match(/width=/g)).toHaveLength(1);
    expect(out.match(/class=/g)).toHaveLength(1);
  });
});

describe('moving an image back when too little text follows', () => {
  const tag = `<img src="data:image/png;base64,${png(100, 56)}">`; // 4 lines tall
  const fit = { maxWidth: 200, lineHeight: 14, charsPerLine: 10 }; // wants 50 characters after
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i % 10}`).join(' ');

  it('leaves the image alone when enough text follows', () => {
    const html = `${words(10)} ${tag} ${words(30)}`;
    const out = bare(sizeCommentaryImages(html, fit));
    expect(out.indexOf('<img')).toBe(html.indexOf('<img'));
  });
  it('moves it back so enough text follows, at a word break', () => {
    const html = `${words(40)} ${tag} end`;
    const out = bare(sizeCommentaryImages(html, fit));
    const at = out.indexOf('<img');
    expect(at).toBeLessThan(html.indexOf('<img'));
    expect(out[at - 1]).toBe(' ');
    // same words, same order, one image
    expect(
      out
        .replace(/<img[^>]*>/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    ).toBe(
      html
        .replace(/<img[^>]*>/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    expect(out.match(/<img/g)).toHaveLength(1);
  });
  it('does not split a tag when moving back', () => {
    const html = `${words(20)} <span class="a b">${words(20)}</span> ${tag}`;
    const out = bare(sizeCommentaryImages(html, fit));
    expect(out.match(/<span class="a b">/g)).toHaveLength(1);
    expect(out).not.toMatch(/<span[^>]*<img/);
  });
  it('moves to the start when there is not enough text before it', () => {
    const out = bare(sizeCommentaryImages(`ab ${tag} cd`, fit));
    expect(out.startsWith('<img')).toBe(true);
  });
});
