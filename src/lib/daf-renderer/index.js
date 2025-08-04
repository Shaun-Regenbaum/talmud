// Re-export the main renderer
export { default } from './renderer.js';
export { defaultOptions } from './options.js';

// Export types (TypeScript will pick these up even from JS files)
export type {
  DafRendererOptions,
  SpacerHeights,
  TextData,
  ContainerElement,
  Containers,
  TextSpans,
  SpacingIssue,
  DafRenderer,
  LayoutType
} from './types';