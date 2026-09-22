import type { JSX } from 'solid-js';
export type GutterKind =
  | 'argument'
  | 'halacha'
  | 'chart'
  | 'aggadata'
  | 'yerushalmi'
  | 'pesuk'
  | 'rishonim';

/** Category colors remain distinct; every glyph uses the same drawing style. */
const CATEGORY_COLORS: Record<GutterKind, string> = {
  argument: 'var(--accent)',
  halacha: '#1e40af',
  chart: '#0e7490',
  aggadata: '#7c3aed',
  yerushalmi: '#0f766e',
  pesuk: '#d97706',
  rishonim: '#475569',
};
export function colorForKind(kind: GutterKind): string {
  return CATEGORY_COLORS[kind];
}

const paths: Record<GutterKind, string[]> = {
  argument: [
    'M15 4H5a2 2 0 0 0-2 2v10l4-3h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z',
    'M8 17h9l4 3V10a2 2 0 0 0-2-2',
  ],
  halacha: ['M12 3v17M7 21h10M4 7h16', 'm6 7-4 7h8L6 7Zm12 0-4 7h8l-4-7Z'],
  chart: ['M4 3h16v18H4Z', 'M4 9h16M4 15h16M10 3v18'],
  aggadata: ['M12 6v15', 'M12 6C9 3 5 3 3 4v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 2Z'],
  yerushalmi: ['m3 8 9-5 9 5H3ZM3 21h18M5 10v8M10 10v8M14 10v8M19 10v8'],
  pesuk: [
    'M7 4h12a2 2 0 0 1 2 2v2h-4',
    'M7 4a2 2 0 0 0-2 2v12H3v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 1 2-2',
    'M9 10h4M9 14h4',
  ],
  rishonim: ['m4 20 4-1L20 7a3 3 0 0 0-4-4L4 15v5Z', 'm14 5 4 4M4 15l4 4M11 21h10'],
};

/** One 24-unit grid, rounded strokes, and a shared weight for all reader icons. */
export function GutterGlyph(props: { kind: GutterKind; size?: number }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={props.size ?? 9}
      height={props.size ?? 9}
      fill="none"
      stroke="currentColor"
      stroke-width={props.size ? 1.8 : 2.5}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {paths[props.kind].map((d) => (
        <path d={d} />
      ))}
    </svg>
  );
}
