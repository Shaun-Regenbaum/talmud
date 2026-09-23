/**
 * Muted inks: the one palette for colored things beside the text in both
 * readers: margin icons, card titles, topic pills, links, argument-map tags and
 * text highlights. Each hue is pulled toward the maroon accent, so nothing
 * shouts over the page. tokens.css mirrors these as `--ink-*` for stylesheets.
 */
export const INK = {
  maroon: '#8a2a2b',
  blue: '#34506f',
  link: '#2f4f74',
  plum: '#6a4a78',
  indigo: '#4b5478',
  teal: '#3d675c',
  cyan: '#3f6b73',
  ochre: '#9a6a2a',
  umber: '#8a6d3b',
  moss: '#4c6b48',
  brick: '#9c4a36',
  slate: '#5b5f66',
  slateLight: '#7a7d82',
} as const;

/** The bright colors the inks replaced (Tailwind violet, blue, teal, cyan,
 *  amber, green and red). Reader surfaces must not bring them back; a test
 *  checks. */
export const RETIRED_BRIGHT = [
  '#7c3aed',
  '#9333ea',
  '#6366f1',
  '#4338ca',
  '#4f46e5',
  '#1e40af',
  '#1d4ed8',
  '#2563eb',
  '#3b82f6',
  '#0369a1',
  '#0f766e',
  '#0e7490',
  '#0891b2',
  '#d97706',
  '#b45309',
  '#f59e0b',
  '#15803d',
  '#16a34a',
  '#059669',
  '#047857',
  '#b91c1c',
  '#dc2626',
  '#eef2ff',
  '#e0e7ff',
  '#c7d2fe',
  '#faf5ff',
  '#f3e8ff',
  '#d8b4fe',
  '#dbeafe',
  '#bfdbfe',
  '#ecfeff',
  '#cffafe',
  '#f0fdf4',
  '#dcfce7',
  '#86efac',
] as const;
