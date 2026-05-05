/**
 * Renderer dispatcher — applies mark run outputs to the daf HTML by picking
 * the right inline transform based on (mark.anchor, mark.render.kind).
 *
 * Each renderer is a pure function (html, instances, def) → html. The
 * dispatcher walks all enabled marks (in deterministic order) and pipes the
 * HTML through each.
 *
 * Currently implemented:
 *   - phrase + inline → wraps existing injectRabbiUnderlines for now (it
 *     already handles Hebrew normalization, abbreviation expansion, and
 *     per-occurrence wrapping). When more phrase+inline marks land we'll
 *     factor out a general inline-decorator that accepts color/style as
 *     config, but for the rabbi proof-point reusing the existing primitive
 *     keeps visual parity.
 *
 * To add a new (anchor, render) combination: implement a renderer function,
 * register it in the RENDERERS table.
 */

import { injectRabbiUnderlines, type GenerationRabbi } from '../injectRabbiUnderlines';
import type { GenerationId } from '../generations';

export interface MarkInstance {
  excerpt?: string;
  segIdx?: number;
  startSegIdx?: number;
  endSegIdx?: number;
  tokenStart?: number;
  tokenEnd?: number;
  fields: Record<string, unknown>;
}

export interface MarkRunOutput {
  parsed: { instances: MarkInstance[] } | null;
}

export interface MarkDef {
  id: string;
  anchor: 'segment' | 'segment-range' | 'phrase' | 'multi-anchor' | 'cross-daf' | 'external' | 'whole-daf';
  render: { kind: string; [key: string]: unknown };
}

type Renderer = (html: string, instances: MarkInstance[], def: MarkDef) => string;

/**
 * phrase + inline → for the rabbi mark specifically, dispatch to the existing
 * injectRabbiUnderlines (which knows how to colour by generation). For other
 * future phrase+inline marks (plants, places, etc.) we'll handle them with a
 * generic inline-decorator below.
 */
const phraseInline: Renderer = (html, instances, def) => {
  if (!html || instances.length === 0) return html;
  if (def.id === 'rabbi') {
    const rabbis: GenerationRabbi[] = instances
      .map((i) => ({
        name: String(i.fields?.name ?? ''),
        nameHe: String(i.fields?.nameHe ?? i.excerpt ?? ''),
        generation: (i.fields?.generation ?? 'unknown') as GenerationId,
      }))
      .filter((r) => r.nameHe.length > 0);
    return injectRabbiUnderlines(html, rabbis);
  }
  // TODO: generic inline-decorator using def.render.style + def.render.color.
  // For now, unknown marks pass through unchanged.
  return html;
};

const RENDERERS: Record<string, Renderer> = {
  'phrase:inline': phraseInline,
};

/**
 * Apply every enabled mark's renderer to the HTML in turn. `marks` is the
 * list of currently-enabled marks (order matters — earlier marks are applied
 * first); `runs` maps mark.id → run output.
 */
export function applyMarkRenderers(
  html: string,
  marks: MarkDef[],
  runs: Record<string, MarkRunOutput | undefined>,
): string {
  let out = html;
  for (const def of marks) {
    const run = runs[def.id];
    const key = `${def.anchor}:${def.render.kind}`;
    if (!run?.parsed) {
      // eslint-disable-next-line no-console
      console.debug(`[renderer] skip ${def.id} (${key}): no parsed run`, { run });
      continue;
    }
    const r = RENDERERS[key];
    if (!r) {
      // No renderer registered for this (anchor, render) combo. This is the
      // expected state for marks that render through a legacy bridge in
      // DafViewer (argument / halacha / aggadata / pesukim — gutter+sidebar
      // is handled by injectAnchorMarkers + GutterIcons + ArgumentSidebar
      // via the existing showX signals). Silent skip; once we move
      // gutter+sidebar into the dispatcher we'll register a real renderer.
      continue;
    }
    const instances = run.parsed.instances ?? [];
    if (instances.length === 0) {
      // eslint-disable-next-line no-console
      console.debug(`[renderer] skip ${def.id} (${key}): zero instances`);
      continue;
    }
    try {
      const before = out.length;
      out = r(out, instances, def);
      // eslint-disable-next-line no-console
      console.debug(`[renderer] applied ${def.id} (${key}): ${instances.length} instances, html ${before} -> ${out.length} chars`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[renderer] ${def.id} (${key}) threw:`, err);
    }
  }
  return out;
}
