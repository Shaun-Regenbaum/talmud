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
import { recordRender } from '../rendererActivity';

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
    const at = Date.now();
    if (!run?.parsed) {
      recordRender(def.id, key, { kind: 'skip-no-run', at });
      continue;
    }
    const r = RENDERERS[key];
    if (!r) {
      // No renderer registered for this (anchor, render) combo — expected
      // for marks that render through the legacy DafViewer bridge
      // (argument / halacha / aggadata / pesukim via gutter+sidebar).
      recordRender(def.id, key, { kind: 'skip-no-renderer', at });
      continue;
    }
    const instances = run.parsed.instances ?? [];
    if (instances.length === 0) {
      recordRender(def.id, key, { kind: 'skip-zero-instances', at });
      continue;
    }
    const t0 = performance.now();
    try {
      const before = out.length;
      out = r(out, instances, def);
      const ms = Math.round(performance.now() - t0);
      recordRender(def.id, key, {
        kind: 'applied',
        instances: instances.length,
        bytesBefore: before,
        bytesAfter: out.length,
        ms,
        at,
      });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      recordRender(def.id, key, { kind: 'error', error: msg, at });
    }
  }
  return out;
}
