import { DECISION_GUARD_SQL } from '../lib/sage-graph/possible-era';
import type { StoredRow } from '../lib/sage-graph/source-reading-store';
import type { RegistryDatabase } from './reviewed-rabbi';

/** One person's current identity decisions in one graph revision, read at most once and shared by every guard. */
export interface DecisionGuard {
  revision: string;
  personKey: string;
  read(): Promise<{ results: StoredRow[]; success?: boolean }>;
}

export function decisionGuard(
  db: RegistryDatabase,
  revision: string,
  personKey: string,
): DecisionGuard {
  let rows: Promise<{ results: StoredRow[]; success?: boolean }> | undefined;
  const k = personKey;
  return {
    revision,
    personKey,
    read: () =>
      (rows ??= db
        .prepare(DECISION_GUARD_SQL)
        .bind(revision, k.split('/')[0], k, k, k, k, k, k)
        .all<StoredRow>()),
  };
}
