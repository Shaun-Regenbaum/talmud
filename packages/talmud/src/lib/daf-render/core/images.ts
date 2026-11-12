/**
 * Inline images in commentary (the printed page's diagrams, embedded by Sefaria
 * as base64 data URIs with no width or height).
 *
 * Two problems with a bare <img>: the browser does not know its size when we
 * measure the layout, and a block image splits the paragraph in two, leaving
 * blank space on both sides. We read the size from the image header, shrink it
 * to fit the narrow column, and tag it so the stylesheet can float it and let
 * the text wrap around it.
 */

export interface ImageSize {
  width: number;
  height: number;
}

function decodeBase64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Width and height from the first bytes of a PNG, GIF or JPEG. */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  const u32 = (i: number) =>
    ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  // PNG: 8-byte signature, then IHDR with width and height as big-endian ints.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return { width: u32(16), height: u32(20) };
  }
  // GIF: "GIF8", then little-endian 16-bit width and height.
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  }
  // JPEG: walk the segments until a start-of-frame marker.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return {
          height: (bytes[i + 5] << 8) | bytes[i + 6],
          width: (bytes[i + 7] << 8) | bytes[i + 8],
        };
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
  }
  return null;
}

const IMG_TAG = /<img\b[^>]*>/gi;
const DATA_SRC = /\ssrc\s*=\s*["']data:image\/(?:png|gif|jpe?g);base64,([A-Za-z0-9+/=]+)["']/i;

export interface ImageFit {
  /** Widest the picture may be, in pixels: it must fit the narrowest text column. */
  maxWidth: number;
  /** Line height of the commentary text, in pixels. */
  lineHeight: number;
  /** Roughly how many characters fit on one line of the narrowest column. */
  charsPerLine: number;
}

/** Number of characters a reader sees in `html[from, to)`, ignoring tags. */
function visibleLength(html: string, from: number, to: number): number {
  let n = 0;
  let inTag = false;
  for (let i = from; i < to; i++) {
    const c = html[i];
    if (c === '<') inTag = true;
    else if (c === '>') inTag = false;
    else if (!inTag) n++;
  }
  return n;
}

/**
 * Index of a word break about `chars` visible characters before `end`, or 0
 * when the text is shorter than that. Never inside a tag.
 */
function wordBreakBefore(html: string, end: number, chars: number): number {
  let seen = 0;
  let i = end;
  while (i > 0 && seen < chars) {
    i--;
    if (html[i] === '>') {
      // jump back over the whole tag
      const open = html.lastIndexOf('<', i);
      if (open < 0) break;
      i = open;
    } else {
      seen++;
    }
  }
  // settle on a space so we never split a word
  while (i > 0 && html[i] !== ' ') i--;
  return html[i] === ' ' ? i + 1 : 0;
}

/**
 * Give every embedded diagram a fixed size and the `daf-img` class, and make
 * sure enough text follows it to wrap beside it.
 *
 * A diagram sits at one spot in the text. If the text ends a few words later,
 * the picture hangs below the last line with blank space beside it. So when
 * too little text follows, we move the picture back a few lines. That is a
 * small shift, since printed diagrams sit beside their passage anyway.
 *
 * An image we cannot measure is left alone and keeps the plain block style.
 */
export function sizeCommentaryImages(html: string, fit: ImageFit): string {
  if (!html?.includes('<img')) return html;
  let out = html;
  IMG_TAG.lastIndex = 0;
  let m = IMG_TAG.exec(out);
  while (m) {
    const tag = m[0];
    const at = m.index;
    const src = DATA_SRC.exec(tag);
    const bytes = src ? decodeBase64(src[1]) : null;
    const size = bytes ? readImageSize(bytes) : null;
    if (!size || size.width < 1 || size.height < 1 || tag.includes('daf-img')) {
      m = IMG_TAG.exec(out);
      continue;
    }
    const width = Math.max(1, Math.min(size.width, Math.round(fit.maxWidth)));
    const height = Math.max(1, Math.round((size.height * width) / size.width));
    const cleaned = tag
      .replace(/\s(?:width|height|class)\s*=\s*("[^"]*"|'[^']*'|\S+)/gi, '')
      .replace(/\/?>$/, '');
    const sized = `${cleaned} class="daf-img" width="${width}" height="${height}">`;

    const end = at + tag.length;
    const wanted = Math.ceil(height / fit.lineHeight + 1) * fit.charsPerLine;
    const after = visibleLength(out, end, out.length);
    let insertAt = at;
    if (after < wanted) insertAt = wordBreakBefore(out, at, wanted - after);
    out = out.slice(0, insertAt) + sized + out.slice(insertAt, at) + out.slice(end);
    IMG_TAG.lastIndex = end + (sized.length - tag.length);
    m = IMG_TAG.exec(out);
  }
  return out;
}
