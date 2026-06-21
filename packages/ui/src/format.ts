/**
 * @corpus/ui — shared display formatters for the inspect/telemetry surfaces
 * (cost + cold-build time), so both apps render numbers identically. Pure, no
 * JSX — safe to import from logic-heavy files (e.g. talmud's run-tree).
 */

/** Cold-build time: "—" when unknown, "ms" under a second, else "s" (1 decimal
 *  under 10s, whole seconds above). */
export const fmtMs = (ms: number | null | undefined): string =>
  ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;

/** USD cost to 4 decimals; "$0" when unknown. */
export const fmtCost = (c: number | null | undefined): string =>
  typeof c === 'number' ? `$${c.toFixed(4)}` : '$0';
