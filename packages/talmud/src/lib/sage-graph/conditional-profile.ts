import type { ReviewedEra } from './types';

/** Saved information about a proposed identity, never facts accepted for the local actor. */
export interface ConditionalProfile {
  status: 'available';
  candidateId: string;
  name: string;
  nameHe: string;
  accepted: false;
  historicalIdentityResolved: false;
  generation: string | null;
  era?: ReviewedEra;
  bio: string | null;
  places: string[];
  sources: { title: string; url: string }[];
  proposal: { recordId: string; payloadSha256: string; personKey: string; revision: string };
  registry: { recordId: string; payloadSha256: string; source: 'graph' | 'bundled' };
}
export type ConditionalProfileResult = ConditionalProfile | { status: 'unavailable' };
