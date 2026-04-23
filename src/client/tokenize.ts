/**
 * Wrap every whitespace-separated Hebrew/Aramaic word in a <span class="daf-word">
 * so the DafRenderer can attach per-word hover/click behavior via event delegation.
 *
 * Preserves all existing element structure (gdropcap / shastitle7 / five / div
 * wrappers from HebrewBooks) — only text nodes are transformed, and each token
 * is wrapped individually so formatting from enclosing spans cascades naturally.
 */
export function tokenizeHebrewHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;
  walk(body);
  return body.innerHTML;
}

const WORD_RE = /(\S+)/g;

function walk(node: Node): void {
  // Iterate over a snapshot since we'll mutate the children list.
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      tokenizeTextNode(child as Text);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      walk(child);
    }
  }
}

function tokenizeTextNode(text: Text): void {
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
    span.textContent = match[1];
    frag.appendChild(span);
    lastIdx = match.index + match[1].length;
  }

  if (lastIdx < content.length) {
    frag.appendChild(doc.createTextNode(content.slice(lastIdx)));
  }

  text.parentNode?.replaceChild(frag, text);
}
