export type Amud = 'a' | 'b';

export type LayoutCase = 'double-wrap' | 'stairs' | 'double-extend';

export interface DafTexts {
  main: string;
  inner: string;
  outer: string;
}

export interface SpacerHeights {
  start: number;
  inner: number;
  outer: number;
  end: number;
  layoutCase: LayoutCase;
  exception: 0 | 1 | 2;
}

export interface ColumnGeometry {
  midWidth: number;
  sideWidth: number;
  fullWidth: number;
  totalContentWidth: number;
}
