// Type definitions for daf-renderer

export interface DafRendererOptions {
  contentWidth: string;
  mainWidth: string;
  halfway: string;
  direction: 'rtl' | 'ltr';
  padding: {
    vertical: string;
    horizontal: string;
  };
  fontFamily: {
    main: string;
    inner: string;
    outer: string;
  };
  fontSize: {
    main: string;
    side: string;
  };
  lineHeight: {
    main: string;
    side: string;
  };
  innerPadding?: string;
  outerPadding?: string;
}

export interface SpacerHeights {
  start: number;
  inner: number;
  outer: number;
  end: number;
  exception?: number;
}

export interface TextData {
  name: 'main' | 'inner' | 'outer';
  width: number;
  text: string;
  lineHeight: number;
  area: number;
  height: number;
  unadjustedArea?: number;
  unadjustedHeight?: number;
}

export interface ContainerElement {
  el: HTMLDivElement;
  spacers: {
    start: HTMLDivElement;
    mid?: HTMLDivElement;
    end?: HTMLDivElement;
    inner?: HTMLDivElement;
    outer?: HTMLDivElement;
  };
  text: HTMLDivElement;
}

export interface Containers {
  el: HTMLDivElement;
  dummy: HTMLDivElement;
  outer: ContainerElement;
  inner: ContainerElement;
  main: ContainerElement;
}

export interface TextSpans {
  main: HTMLSpanElement;
  inner: HTMLSpanElement;
  outer: HTMLSpanElement;
}

export interface SpacingIssue {
  section: 'main' | 'inner' | 'outer';
  textHeight: number;
  containerHeight: number;
  ratio: number;
  excessSpace: number;
}

export interface DafRenderer {
  containers: Containers;
  spacerHeights: SpacerHeights;
  amud: 'a' | 'b';
  spacingIssues?: SpacingIssue[];
  render(
    main: string,
    inner: string,
    outer: string,
    amud?: 'a' | 'b',
    linebreak?: string,
    renderCallback?: () => void,
    resizeCallback?: () => void
  ): void;
  checkExcessiveSpacing(): void;
  destroy?(): void;
}

export type LayoutType = 'double-wrap' | 'stairs' | 'double-extend';