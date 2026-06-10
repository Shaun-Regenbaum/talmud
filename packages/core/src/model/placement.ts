/**
 * Placement — the LIFECYCLE by which an anchor is earned, not a fifth
 * primitive. A piece may start coarse (unit), get refined to a segment by a
 * deterministic matcher, then to tokens by AI, then corrected by a human; each
 * step is an anchor-refinement artifact, and {@link applyRefinements} is the
 * one writer that folds refinements onto their targets (mirroring the legacy
 * applyMatches semantics in ../context/match.ts).
 *
 * Rules, in order of authority:
 *  - a human-earned anchor (via 'human') is NEVER replaced;
 *  - a refinement applies only when the target has no anchor on that spine, or
 *    the refinement is STRICTLY finer than what's there (precision over
 *    recall: never silently downgrade).
 */

import type { Anchor } from './anchor.ts';
import { comparePrecision, precisionRank } from './anchor.ts';
import type { Artifact } from './artifact.ts';

export { comparePrecision, precisionRank };

/** Anchored to an actual span of the text (tokens or segments) — "located". */
export function isLocated(a: Anchor): boolean {
  return a.precision === 'token' || a.precision === 'segment';
}

/** Earned by the AI placer ('ai', or a qualified 'ai-*' via like 'ai-phrase'). */
export function isAiEarned(a: Anchor): boolean {
  return a.via === 'ai' || (a.via?.startsWith('ai-') ?? false);
}

export function isHumanEarned(a: Anchor): boolean {
  return a.via === 'human';
}

/** Body of a kind='anchor-refinement' artifact: a better anchor for another
 *  artifact. */
export interface RefinementBody {
  targetArtifactId: string;
  anchor: Anchor;
}

/**
 * Fold refinements onto their target artifacts in place (mirrors applyMatches:
 * pure logic, mutates the passed array's members). Per refinement: find the
 * target by id; on the refinement anchor's spine, add the anchor if none is
 * there, or replace the existing one(s) only when the refinement is strictly
 * finer than ALL of them; never touch a spine that carries a human-earned
 * anchor. Returns the number of refinements applied.
 */
export function applyRefinements(
  artifacts: Artifact[],
  refinements: Artifact<RefinementBody>[],
): number {
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  let applied = 0;
  for (const r of refinements) {
    const target = byId.get(r.body.targetArtifactId);
    if (!target) continue;
    const next = r.body.anchor;
    const onSpine = target.anchors.filter((a) => a.spine === next.spine);
    if (onSpine.length === 0) {
      target.anchors.push(next);
      applied++;
      continue;
    }
    if (onSpine.some(isHumanEarned)) continue;
    const finest = Math.max(...onSpine.map((a) => precisionRank(a.precision)));
    if (precisionRank(next.precision) <= finest) continue;
    target.anchors = [...target.anchors.filter((a) => a.spine !== next.spine), next];
    applied++;
  }
  return applied;
}
