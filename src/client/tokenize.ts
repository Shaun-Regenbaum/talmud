/**
 * Wrap every whitespace-separated Hebrew/Aramaic word in a <span class="daf-word">
 * so the DafRenderer can attach per-word hover/click behavior via event delegation.
 *
 * Preserves all existing element structure (gdropcap / shastitle7 / five / div
 * wrappers from HebrewBooks) — only text nodes are transformed, and each token
 * is wrapped individually so formatting from enclosing spans cascades naturally.
 *
 * Each word also gets a stable `data-word-index` (monotonic, in document order)
 * so callers can address an exact HB word position — used by the alignment
 * workbench to anchor external content onto specific words. Downstream passes
 * (injectHadran, injectSegmentMarkers) only move/annotate these spans, never
 * reorder or recreate them, so the index stays stable.
 */
export function tokenizeHebrewHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const counter = { n: 0 };
  walk(doc.body, counter);
  return doc.body.innerHTML;
}

const WORD_RE = /(\S+)/g;

function walk(node: Node, counter: { n: number }): void {
  // Iterate over a snapshot since we'll mutate the children list.
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      tokenizeTextNode(child as Text, counter);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      walk(child, counter);
    }
  }
}

function tokenizeTextNode(text: Text, counter: { n: number }): void {
  const content = text.nodeValue ?? '';
  if (!content.trim()) return;

  const doc = text.ownerDocument;
  if (!doc) return;

  const frag = doc.createDocumentFragment();
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(WORD_RE.source, WORD_RE.flags);

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIdx) {
      frag.appendChild(doc.createTextNode(content.slice(lastIdx, match.index)));
    }
    const span = doc.createElement('span');
    span.className = 'daf-word';
    span.setAttribute('data-word-index', String(counter.n++));
    span.textContent = match[1];
    frag.appendChild(span);
    lastIdx = match.index + match[1].length;
  }

  if (lastIdx < content.length) {
    frag.appendChild(doc.createTextNode(content.slice(lastIdx)));
  }

  text.parentNode?.replaceChild(frag, text);
}
