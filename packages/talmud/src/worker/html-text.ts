// Strip Sefaria's inline markup (footnote spans, <b>, <i>, bare <br>) down to
// plain text. Sefaria returns HTML in both `he` and `en`; every consumer here
// wants prose, whether it is going into a prompt, a cached slice, or a
// response body. Lives in its own module so route files can use it without
// importing the worker entry file.

export function stripHtmlServer(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
