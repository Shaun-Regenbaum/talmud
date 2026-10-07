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
