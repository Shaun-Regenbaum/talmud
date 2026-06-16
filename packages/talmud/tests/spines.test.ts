/**
 * talmudSpines (src/worker/spines.ts) — the app's spine registry: the home Bavli
 * spine plus the external spines a daf links INTO (Tanach + the codifier codes),
 * wiring the four-primitive model's reserved 'external' anchor.
 */

import { describe, expect, it } from 'vitest';
import { talmudSpines } from '../src/worker/spines';

describe('talmudSpines registry', () => {
  it('registers the home Bavli spine', () => {
    expect(talmudSpines.get('bavli')?.levels).toEqual(['tractate', 'page', 'seg']);
  });

  it('registers the Tanach spine matching the tanach app', () => {
    expect(talmudSpines.get('tanach')?.levels).toEqual(['book', 'chapter', 'verse']);
  });

  it('registers a code spine per canonical codifier', () => {
    expect(talmudSpines.get('mishneh-torah')?.label).toBe('Mishneh Torah');
    expect(talmudSpines.get('shulchan-aruch')?.label).toBe('Shulchan Aruch');
    expect(talmudSpines.get('mishnah-berurah')).toBeDefined();
  });

  it('validates + rejects reference paths', () => {
    expect(talmudSpines.ref('tanach', ['Genesis', 19, 5])).toEqual(['Genesis', 19, 5]);
    expect(() => talmudSpines.ref('tanach', ['a', 'b', 'c', 'd'])).toThrow(); // too deep
    expect(() => talmudSpines.ref('nope', ['x'])).toThrow(); // unknown spine
  });
});
