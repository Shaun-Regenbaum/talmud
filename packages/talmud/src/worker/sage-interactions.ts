import { canonicalSlug } from '../lib/rabbi/identity';

/**
 * A sage's connections, as the text records them, for the API and the MCP.
 *
 * The data is the same static file the rabbi card reads (static/sage-interactions/<slug>.json, built by
 * research/sage-network/pipeline/31_app_interactions.py). It exists only for sages the study is sure are one man
 * behind one name. For every other sage the connections are still being worked out, and we say so rather than
 * serve the old teacher/student tree, which a model had pulled out of short biographies.
 */

export const CONNECTIONS_IN_PROGRESS_NOTE =
  "This sage's connections are still being worked out: we are checking who this is, and who he is linked to, " +
  'from the text itself. The old teacher/student tree was withdrawn because it came from model guesses.';

export const CONNECTIONS_READY_NOTE =
  'Every name most often linked to this sage in the text, with what the passages say between them. Counts are ' +
  'passages. A partner is a name as the text writes it; one name can still stand for more than one man.';

export interface Connections {
  status: 'ready' | 'in-progress';
  slug: string;
  note: string;
  /** Present when ready: the same body the card shows. */
  interactions?: Record<string, unknown>;
}

async function readJson(p: Promise<Response>): Promise<Record<string, unknown> | null> {
  try {
    const res = await p;
    if (!res.ok) return null;
    const text = await res.text();
    // The assets binding serves index.html (status 200) for a missing path: accept only our JSON.
    if (!text.trimStart().startsWith('{')) return null;
    const body = JSON.parse(text) as Record<string, unknown>;
    return body && Array.isArray(body.partners) ? body : null;
  } catch {
    return null;
  }
}

const SLUG_RE = /^[a-z0-9()-]+$/;

/** The sage's connections, or an honest "still in progress". `origin` is the public copy to try when there is no
 *  assets binding; null skips the network (tests). */
export async function loadConnections(
  assets: Fetcher | undefined,
  slug: string,
  origin: string | null,
): Promise<Connections> {
  slug = canonicalSlug(slug);
  const inProgress: Connections = {
    status: 'in-progress',
    slug,
    note: CONNECTIONS_IN_PROGRESS_NOTE,
  };
  if (!SLUG_RE.test(slug)) return inProgress;
  const path = `/sage-interactions/${slug}.json`;
  let body = assets
    ? await readJson(assets.fetch(new Request(`https://assets.local${path}`)))
    : null;
  // The public copy only when there is no assets binding (the generation worker): when the binding answers without
  // a file, the sage simply has none yet.
  if (!body && !assets && origin) body = await readJson(fetch(`${origin}${path}`));
  return body
    ? { status: 'ready', slug, note: CONNECTIONS_READY_NOTE, interactions: body }
    : inProgress;
}
