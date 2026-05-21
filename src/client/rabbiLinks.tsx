/**
 * Rabbi-link utilities: resolve a display name to a slug against the daf's
 * rabbi list, and render English prose with rabbi mentions wrapped as
 * clickable spans.
 *
 * Resolution is strictly bounded to dafContext().rabbis — no fuzzy match
 * against unknown names — so unresolved text stays inert. Routing is by
 * `name` (the caller passes that to `onPushRabbi` and DafViewer's openRabbi
 * looks up the IdentifiedRabbi by name).
 */
import { For, createContext, useContext, type JSX } from 'solid-js';
import type { IdentifiedRabbi } from './dafContext';
import { Hebraized } from './Hebraized';

/** Provided by ArgumentSidebar / panels so deeply-nested prose (e.g. inside
 *  MarkEnrichmentCards' ParsedFieldView) can wrap rabbi mentions as click-
 *  ables without prop-drilling through generic components. Absent context
 *  means "render plain text" — RabbiText silently falls back to Hebraized. */
export interface RabbiLinkContextValue {
  rabbis: IdentifiedRabbi[];
  onPushRabbi: (name: string) => void;
}

const RabbiLinkContext = createContext<RabbiLinkContextValue | null>(null);

export function RabbiLinkProvider(props: {
  value: RabbiLinkContextValue;
  children: JSX.Element;
}): JSX.Element {
  return (
    <RabbiLinkContext.Provider value={props.value}>
      {props.children}
    </RabbiLinkContext.Provider>
  );
}

export function useRabbiLinks(): RabbiLinkContextValue | null {
  return useContext(RabbiLinkContext);
}

/** Drop-in replacement for `<Hebraized text=...>` that, when a RabbiLink
 *  context is in scope, wraps rabbi mentions as clickable links. When no
 *  context is present (e.g. outside the sidebar), behaves like Hebraized. */
export function HebraizedWithRabbis(props: { text: string | undefined | null }): JSX.Element {
  const ctx = useRabbiLinks();
  if (!ctx) return <Hebraized text={props.text} />;
  return <RabbiText text={props.text} rabbis={ctx.rabbis} onPushRabbi={ctx.onPushRabbi} />;
}

/** Normalize a rabbi name for fuzzy English match: drop honorific prefixes,
 *  lowercase, collapse whitespace. "Rabbi Yochanan" → "yochanan",
 *  "R. Acha" → "acha", "Rav Ashi" → "ashi". */
function normalizeRabbiName(s: string): string {
  return s
    .replace(/\b(Rabbi|Rabban|Rav|Rabbah|R\.)\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Return the rabbi from `rabbis` whose name matches `query`, or null.
 *  Tries direct equality first, then normalized form. */
export function resolveRabbi(
  query: string,
  rabbis: IdentifiedRabbi[],
): IdentifiedRabbi | null {
  if (!query || rabbis.length === 0) return null;
  const direct = rabbis.find((r) => r.name === query);
  if (direct) return direct;
  const norm = normalizeRabbiName(query);
  if (!norm) return null;
  return rabbis.find((r) => normalizeRabbiName(r.name) === norm) ?? null;
}

/** Build a regex that matches any of the given rabbi display names as
 *  whole words. Names are sorted longest-first so "Rabbi Yochanan ben
 *  Zakkai" beats "Rabbi Yochanan". Word boundaries are unicode-safe
 *  enough for our English prose. */
function buildNameRegex(names: string[]): RegExp | null {
  if (names.length === 0) return null;
  const escaped = names
    .filter((n) => n && n.trim().length > 0)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return null;
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
}

/** Inline link styling for clickable rabbi mentions inside prose. */
const linkStyle: JSX.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  color: '#1e40af',
  cursor: 'pointer',
  'text-decoration': 'underline',
  'text-decoration-style': 'dotted',
  'text-underline-offset': '2px',
  font: 'inherit',
};

/** Render `text` as a paragraph, wrapping every occurrence of a name from
 *  `rabbis` (or any explicit name in `extraNames`) as a clickable button
 *  that calls `onPushRabbi(displayName)`. Anything that doesn't match
 *  passes through Hebraized (so existing (term) markup keeps working).
 *
 *  `extraNames` lets a caller (e.g. an argument-move card) feed in names
 *  from a structured field — say `move.rabbiNames` — that may include
 *  rabbis not in dafContext yet but worth wrapping anyway. We still try
 *  to resolve via `rabbis` before treating it as a click target; an
 *  unresolved name falls through as plain text. */
export function RabbiText(props: {
  text: string | undefined | null;
  rabbis: IdentifiedRabbi[];
  onPushRabbi: (name: string) => void;
  extraNames?: string[];
}): JSX.Element {
  const text = props.text ?? '';
  if (!text) return <></>;

  // Pool of names to scan for. Each entry is a display name we'll attempt
  // to resolve at click time. Pulling display names off `rabbis` plus any
  // structured extras gives us both daf-wide coverage and per-instance
  // names the enricher already extracted.
  const pool = [
    ...props.rabbis.map((r) => r.name),
    ...(props.extraNames ?? []),
  ];
  // De-dupe — extraNames frequently overlap dafContext names.
  const uniq = Array.from(new Set(pool.filter((n) => n && n.trim().length > 0)));
  const re = buildNameRegex(uniq);
  if (!re) {
    return <Hebraized text={text} />;
  }

  type Part = { kind: 'text'; value: string } | { kind: 'link'; value: string };
  const parts: Part[] = [];
  let lastIdx = 0;
  re.lastIndex = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > lastIdx) {
      parts.push({ kind: 'text', value: text.slice(lastIdx, m.index) });
    }
    parts.push({ kind: 'link', value: m[1] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ kind: 'text', value: text.slice(lastIdx) });
  }

  return (
    <For each={parts}>{(p) => {
      if (p.kind === 'text') return <Hebraized text={p.value} />;
      const resolved = resolveRabbi(p.value, props.rabbis);
      if (!resolved) return <Hebraized text={p.value} />;
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); props.onPushRabbi(resolved.name); }}
          style={linkStyle}
          title={`Open ${resolved.name}`}
        >{p.value}</button>
      );
    }}</For>
  );
}
