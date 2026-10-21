import type { InitialReading } from './initial-readings';
import type { PossibleEra } from './possible-era';

export interface CheckedConnection {
  id: string;
  passageId: string;
  ref: string;
  a: string;
  b: string;
  type: string;
  relation?: string;
  mode: string;
  outcome: string;
  decision: string;
  reason: string;
  historicalIdentityResolved: boolean;
  premiseConnectionIds?: string[];
  evidence: { quote: string; location: string }[];
}
export interface CheckedNode {
  id: string;
  name: string;
  nameHe: string;
  identityResolved: boolean;
  hasSourceProfile?: boolean;
  generation: string | null;
}
export interface CheckedOccurrence {
  personKey: string;
  personId: string;
  ref: string;
  passageId: string;
  characterStart: number;
  characterEnd: number;
  quote: string;
  generation: string | null;
  source: string;
  name: string;
}
export interface CheckedGraph {
  revision: string;
  connections: CheckedConnection[];
  supporting: CheckedConnection[];
  nodes: CheckedNode[];
  occurrences: CheckedOccurrence[];
  nextCursor: string | null;
  occurrencesTruncated: boolean;
}

export interface PersonSource {
  title: string;
  url: string;
}
export interface ReviewedEra {
  start: number;
  end: number;
  label: string;
  labelHe: string;
  source: PersonSource;
}
export interface ReviewedPlace {
  place: string;
  placeHe: string;
  event: string;
  eventHe: string;
  ref: string;
  quote: string;
  /** Only a reviewed gazetteer match may be plotted. */
  mapPlace: string | null;
}
export interface SourcePerson {
  /** The source-reading store revisions this card was read with, and the store that held it. */
  sourceRevisions?: Record<'bavli' | 'other', string | null>;
  sourceStore?: 'bavli' | 'other';
  possibleEra?: PossibleEra;
  initialReading?: InitialReading;
  readingBasis?: InitialReading;
  readingBasisUnavailable?: boolean;
  revision: string;
  id: string;
  name: string;
  nameHe: string;
  summary: string;
  summaryHe: string;
  era?: ReviewedEra;
  generation?: string | null;
  resolvedTo?: string;
  places?: ReviewedPlace[];
  ref: string;
  quote: string;
}
