import type { JSX } from 'solid-js';
export type GutterKind =
  | 'argument'
  | 'halacha'
  | 'chart'
  | 'aggadata'
  | 'yerushalmi'
  | 'pesuk'
  | 'rishonim';

export function colorForKind(kind: GutterKind): string {
  return kind === 'argument'
    ? 'var(--accent)'
    : kind === 'halacha'
      ? '#1e40af'
      : kind === 'chart'
        ? '#0e7490'
        : kind === 'aggadata'
          ? '#7c3aed'
          : kind === 'yerushalmi'
            ? '#0f766e'
            : kind === 'rishonim'
              ? '#475569'
              : '#d97706';
}

/** SVG/glyph for an icon, sized to the 14×14 button. Stroke-based Lucide
 *  icons for argument/halacha/aggadata; Hebrew letters for pesuk and rishonim. */
export function GutterGlyph(props: { kind: GutterKind; size?: number }): JSX.Element {
  return props.kind === 'argument' ? (
    <svg
      viewBox="0 0 24 24"
      width={props.size ?? 9}
      height={props.size ?? 9}
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      <path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" />
    </svg>
  ) : props.kind === 'halacha' ? (
    <svg
      viewBox="0 0 24 24"
      width={props.size ?? 9}
      height={props.size ?? 9}
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381" />
      <path d="m16 16 6-6" />
      <path d="m21.5 10.5-8-8" />
      <path d="m8 8 6-6" />
      <path d="m8.5 7.5 8 8" />
    </svg>
  ) : props.kind === 'aggadata' ? (
    <svg
      viewBox="0 0 24 24"
      width={props.size ?? 9}
      height={props.size ?? 9}
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  ) : props.kind === 'yerushalmi' ? (
    <span
      aria-hidden="true"
      style={{
        'font-family': '"Mekorot Vilna", "SBL Hebrew", "Frank Ruehl", "Times New Roman", serif',
        'font-size': `${props.size ?? 11}px`,
        'font-weight': 700,
        'line-height': 1,
        color: '#fff',
      }}
    >
      י
    </span>
  ) : props.kind === 'chart' ? (
    <svg
      viewBox="0 0 24 24"
      width={props.size ?? 9}
      height={props.size ?? 9}
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
    </svg>
  ) : props.kind === 'rishonim' ? (
    <span
      aria-hidden="true"
      style={{
        'font-family': '"Mekorot Vilna", "SBL Hebrew", "Frank Ruehl", "Times New Roman", serif',
        'font-size': `${props.size ?? 11}px`,
        'font-weight': 700,
        'line-height': 1,
        color: '#fff',
      }}
    >
      ר
    </span>
  ) : (
    <span
      aria-hidden="true"
      style={{
        'font-family': '"Mekorot Vilna", "SBL Hebrew", "Frank Ruehl", "Times New Roman", serif',
        'font-size': `${props.size ?? 11}px`,
        'font-weight': 700,
        'line-height': 1,
        color: '#fff',
      }}
    >
      פ
    </span>
  );
}
