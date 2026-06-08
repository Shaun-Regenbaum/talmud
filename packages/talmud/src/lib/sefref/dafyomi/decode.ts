/**
 * @fileoverview Charset-sniffing decode for dafyomi.co.il HTML.
 *
 * The site serves a MIX of encodings with NO charset in the Content-Type
 * header: newer pages (e.g. Chullin) are UTF-8, older ones (e.g. Berachos) are
 * windows-1255 (legacy Hebrew). A blanket `res.text()` assumes UTF-8 and turns
 * every windows-1255 Hebrew byte into a U+FFFD replacement char (the "????"
 * mojibake seen in the alignment cards).
 *
 * Sniff instead: valid UTF-8 wins (Hebrew in UTF-8 is multi-byte and decodes
 * cleanly); otherwise the bytes are windows-1255. Runs of windows-1255 Hebrew
 * (single high bytes 0xE0-0xFA) don't form valid UTF-8 continuation sequences,
 * so a strict UTF-8 decode reliably throws on those pages and we fall back.
 * Both the Worker (live fetch) and Node (offline scraper) runtimes support
 * `TextDecoder('windows-1255')`.
 */

export function decodeDafyomiHtml(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1255').decode(bytes);
  }
}
