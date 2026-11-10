/** Names in the text that might be this sage, but were placed on someone else or not settled. */

export interface SageMaybeRow {
  ref: string;
  /** The name as the passage writes it. */
  label: string;
  status: string;
  /** The sage the name was placed on. Null when two models disagreed. */
  placed: string | null;
  agreement: string;
  /** Why this sage was not chosen, or why they might be the one. */
  why: string | null;
  /** Every sage that was a possible answer, this one included. */
  options: string[];
}

export interface SageMaybe {
  ref: string;
  label: string;
  /** which_one: two models chose different sages. one_model: placed elsewhere with one model behind it. ruled_out: placed elsewhere by two models. */
  state: 'which_one' | 'one_model' | 'ruled_out';
  placedAs: string | null;
  /** The other possible sages besides this one and the one it was placed on. */
  alsoPossible: string[];
  why: string | null;
}

export const MAX_MAYBE = 200;
const ORDER = { which_one: 0, one_model: 1, ruled_out: 2 } as const;

/** One row per name. A father named only inside a son's name is never offered: there is nothing to choose between. */
export function summarizeSageMaybe(slug: string, rows: SageMaybeRow[]): SageMaybe[] {
  const out: SageMaybe[] = [];
  for (const row of rows) {
    if (!row.options.includes(slug) || row.placed === slug) continue;
    const state =
      row.status === 'which_one'
        ? 'which_one'
        : row.status === 'placed' && row.agreement === 'one_model'
          ? 'one_model'
          : row.status === 'placed'
            ? 'ruled_out'
            : null;
    if (!state) continue;
    out.push({
      ref: row.ref,
      label: row.label,
      state,
      placedAs: row.placed,
      alsoPossible: row.options.filter((o) => o !== slug && o !== row.placed),
      why: row.why,
    });
  }
  return out
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.ref.localeCompare(b.ref))
    .slice(0, MAX_MAYBE);
}
