/**
 * Rabbi-link utilities: resolve a display name against the daf's rabbi list,
 * and render English prose with rabbi mentions wrapped as clickable links.
 *
 * The matcher pool combines two sources:
 *   1. `rabbis` — IdentifiedRabbi entries from dafContext. Used for name
 *      normalization and slug-keyed routing.
 *   2. `extraNames` — bare display names from structured fields (move.rabbiNames,
 *      section.rabbiNames, voices[].name) that may not be present in
 *      dafContext (the rabbi-places dataset has gaps; the LLM-extracted
 *      names are more complete). These match in the prose; routing falls
 *      through pushRabbi's name-lookup fallback chain in DafViewer.
 *
 * The context value uses ACCESSORS (functions), not plain values, so Solid
 * tracks reads inside JSX/memos and consumers re-evaluate when daf-level
 * state changes (e.g. dafContext loads async after the sidebar mounts).
 */
import { For, createContext, createMemo, useContext, type Accessor, type JSX } from 'solid-js';
import type { IdentifiedRabbi } from './dafContext';
import { Hebraized } from './Hebraized';
import { ConceptAwareText } from './conceptLinks';

export interface RabbiLinkContextValue {
  rabbis: Accessor<IdentifiedRabbi[]>;
  extraNames: Accessor<string[]>;
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
  // No rabbi pool here — still layer in concept tooltips (ConceptAwareText
  // itself falls back to plain Hebraized when there's no concept context).
  if (!ctx) return <ConceptAwareText text={props.text} />;
  return (
    <RabbiText
      text={props.text}
      rabbis={ctx.rabbis()}
      extraNames={ctx.extraNames()}
      onPushRabbi={ctx.onPushRabbi}
    />
  );
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
 *  Zakkai" beats "Rabbi Yochanan". */
function buildNameRegex(names: string[]): RegExp | null {
  const cleaned = names
    .filter((n) => n && n.trim().length > 0)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (cleaned.length === 0) return null;
  return new RegExp(`\\b(${cleaned.join('|')})\\b`, 'g');
}

export interface RabbiTextPart { kind: 'text' | 'link'; value: string; }

/** Split prose into plain-text and rabbi-link parts. Every matched name yields
 *  a 'link' part whose `value` is the matched name verbatim — so a linkified
 *  name is NEVER rendered empty (the blank-name class). Names are matched
 *  whole-word, longest-first. Pure + exported for tests. */
export function tokenizeRabbiMentions(text: string, names: string[]): RabbiTextPart[] {
  if (!text) return [];
  const uniq = Array.from(new Set(names.filter((n) => n && n.trim().length > 0)));
  const re = buildNameRegex(uniq);
  if (!re) return [{ kind: 'text', value: text }];
  const out: RabbiTextPart[] = [];
  let lastIdx = 0;
  re.lastIndex = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > lastIdx) out.push({ kind: 'text', value: text.slice(lastIdx, m.index) });
    out.push({ kind: 'link', value: m[1] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) out.push({ kind: 'text', value: text.slice(lastIdx) });
  return out;
}

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

/** Render `text`, wrapping every occurrence of a known rabbi name as a
 *  clickable inline button. Names not in either pool pass through as plain
 *  text. Matching is whole-word; routing goes through `onPushRabbi`,
 *  which falls back to a stub IdentifiedRabbi when the name isn't in
 *  dafContext. */
export function RabbiText(props: {
  text: string | undefined | null;
  rabbis: IdentifiedRabbi[];
  onPushRabbi: (name: string) => void;
  extraNames?: string[];
}): JSX.Element {
  // All reactive reads happen inside this memo so prop changes (e.g.
  // dafContext loading after mount, a new sidebar entry pushing) trigger
  // re-tokenization.
  const parts = createMemo(() => tokenizeRabbiMentions(props.text ?? '', [
    ...props.rabbis.map((r) => r.name),
    ...(props.extraNames ?? []),
  ]));

  return (
    <For each={parts()}>{(p) => {
      // Concept tooltips layer UNDER rabbi links: a name matched as a rabbi is
      // already a 'link' part, so only the non-rabbi text is scanned for terms.
      if (p.kind === 'text') return <ConceptAwareText text={p.value} />;
      // For routing: try slug resolution against rabbis; if missing,
      // still emit a link button — pushRabbi handles unresolved names by
      // building a stub from the rabbi mark or just highlighting on the
      // daf.
      const resolved = resolveRabbi(p.value, props.rabbis);
      const targetName = resolved ? resolved.name : p.value;
      // Inline <span role="link">, NOT <button> — a <button>'s text is atomic
      // and gets dropped when the user selects/copies the surrounding prose, so
      // copying a paragraph silently lost every rabbi name. A span keeps the
      // name in the document text flow (copyable) while staying clickable +
      // keyboard-accessible.
      return (
        <span
          role="link"
          tabindex={0}
          onClick={(e) => { e.stopPropagation(); props.onPushRabbi(targetName); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); props.onPushRabbi(targetName); }
          }}
          style={linkStyle}
          title={`Open ${targetName}`}
        >{p.value}</span>
      );
    }}</For>
  );
}
