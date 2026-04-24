import type { GenerationId } from '../../client/generations';

export type EraSignalSource =
  | 'speaker'        // a named rabbi was attributed as the speaker
  | 'marker'         // structural marker (מתני׳ / דתניא / תנו רבנן …)
  | 'register'       // language-register lexicon scoring
  | 'stam-default'   // no signal — default to late Bavli (Stam)
  | 'llm';           // future: LLM second-pass

export interface SegmentEra {
  segIdx: number;
  era: GenerationId;
  source: EraSignalSource;
  why: string;
  speakers?: { nameHe: string; era: GenerationId }[];
}

export interface DafEraContext {
  segments: SegmentEra[];
  generationsPresent: GenerationId[];
  computedAt: number;
}
