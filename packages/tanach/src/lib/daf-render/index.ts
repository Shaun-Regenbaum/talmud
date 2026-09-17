/**
 * The Vilna page layout, as a Solid component.
 *
 * The layout algorithm is a port of daf-renderer
 * (https://github.com/TalmudLab/daf-renderer, MIT license,
 * Copyright (c) 2020 Dan Jutan and Shaun Regenbaum): the same column geometry,
 * the same "stairs" cases for where Rashi and Tosafot start and stop, the same
 * exception states when a commentary runs out early. What differs is the host:
 * measurement and rendering go through Solid rather than direct DOM writes.
 * `packages/talmud/src/client/Compare.tsx` puts this port next to the npm
 * original so drift is visible.
 */
export type { DafGeometry, LayoutResult } from './core/layout';
export { computeGeometry, computeLayout } from './core/layout';
export type { DafOptions, PartialDafOptions } from './core/options';
export { defaultOptions, resolveOptions } from './core/options';
export type { Amud, ColumnGeometry, DafTexts, LayoutCase, SpacerHeights } from './core/types';
export type { DafRendererProps } from './solid/DafRenderer';
export { DafRenderer } from './solid/DafRenderer';
