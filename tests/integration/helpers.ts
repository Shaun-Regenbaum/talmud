// Shared helpers for integration tests.
//
// Integration tests hit the deployed worker (or localhost dev). Set
// `TALMUD_URL` to choose which — default is localhost:5173. When neither is
// running, tests are still collected; they will fail fast with a clear
// network-error message rather than silently skipping.

export const BASE_URL = process.env.TALMUD_URL ?? 'http://localhost:5173';

// Normalize Hebrew for substring search: drop nikkud + punctuation, collapse
// whitespace. Must match the server's normalizeHebrew so that anchor checks
// (excerpt ⊂ focal, opinionStart ⊂ focal) reproduce the server's validator.
export function normalizeHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/[.,:;?!"'״׳()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function getJson<T = unknown>(path: string): Promise<T> {
  const res = await fetch(BASE_URL + path);
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Fetch the normalized focal-amud Hebrew text for a daf, suitable for
 * substring-anchor checks. Uses /api/daf, strips HTML, normalizes.
 */
export async function getFocalHebrewNormalized(tractate: string, page: string): Promise<string> {
  const daf = await getJson<{ mainText?: { hebrew?: string } }>(
    `/api/daf/${encodeURIComponent(tractate)}/${encodeURIComponent(page)}`,
  );
  const raw = daf.mainText?.hebrew ?? '';
  return normalizeHebrew(stripHtml(raw));
}
