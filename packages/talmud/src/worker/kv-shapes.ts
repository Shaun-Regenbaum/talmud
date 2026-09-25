/**
 * The shapes the worker accepts back out of KV, for values read in more than
 * one file. Single-use shapes stay next to their read.
 *
 * Read kv-json.ts first: these are gates, not contracts. Every one of them is
 * written as loosely as the readers allow - unknown keys pass through, a field
 * is required only when a reader would throw or produce nonsense without it.
 * The cost of being too strict is real: a generated artifact costs money to
 * make again, so a schema that rejects a good value is worse than one that lets
 * an odd value through.
 */

import { z } from 'zod';

/** `{ tractate, page }`, the daf address used all over the worker. */
export const dafRefShape = z.looseObject({ tractate: z.string(), page: z.string() });

/**
 * A stored producer result (the `mark:` / `enrich:` key families). The body
 * under `parsed` is whatever that producer's own schema says, and readers all
 * pick their way through it defensively, so this checks only the envelope: an
 * object, with `parsed` present or not. That is enough to catch a truncated
 * write or a value from an unrelated key, which is what the readers cannot
 * survive today.
 */
export const artifactEnvelopeShape = z.looseObject({ parsed: z.unknown().optional() });

/** The cross-daf sugya bridge (lib/typing/bridge.ts). */
export const dafBridgeShape = z.looseObject({
  from: dafRefShape,
  to: dafRefShape.nullable(),
  continues: z.boolean(),
  kind: z.string(),
  via: z.string(),
  note: z.string().optional(),
});

/** How one daf's argument sections relate to the next daf's
 *  (lib/typing/crossFlow.ts). Edge fields are checked because the renderer
 *  indexes sections by number. */
export const crossFlowShape = z.looseObject({
  from: dafRefShape,
  to: dafRefShape.nullable(),
  edges: z.array(
    z.looseObject({
      fromSection: z.number(),
      toSection: z.number(),
      relation: z.string(),
      note: z.string().optional(),
    }),
  ),
  via: z.string(),
});

/** The built voice graph (voice-graph.ts). Node and edge bodies are left open:
 *  the readers project the fields they want and tolerate the rest. */
export const voiceGraphBlobShape = z.looseObject({
  nodes: z.record(z.string(), z.unknown()),
  edges: z.record(z.string(), z.unknown()),
  builtAt: z.number(),
});
