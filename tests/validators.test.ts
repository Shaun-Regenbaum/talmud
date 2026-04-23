import { describe, it, expect } from 'vitest';
import { validateGenerations } from '../src/worker/index';

// validateGenerations guards the stage-1/stage-2 Kimi & Gemma output. It's a
// type-narrowing predicate: `x is GenerationsResult`.
describe('validateGenerations', () => {
  it('accepts a well-formed rabbis list', () => {
    const payload = {
      rabbis: [
        { name: 'Hillel',                      nameHe: 'הלל',        generation: 'zugim'        },
        { name: 'Rabbi Akiva',                 nameHe: 'רבי עקיבא', generation: 'tanna-2'      },
        { name: 'Rav Zeira',                   nameHe: 'רבי זירא',  generation: 'amora-bavel-3' },
      ],
    };
    expect(validateGenerations(payload)).toBe(true);
  });

  it('accepts empty rabbis array', () => {
    expect(validateGenerations({ rabbis: [] })).toBe(true);
  });

  it('rejects null / non-object', () => {
    expect(validateGenerations(null)).toBe(false);
    expect(validateGenerations(undefined)).toBe(false);
    expect(validateGenerations(42)).toBe(false);
    expect(validateGenerations('string')).toBe(false);
  });

  it('rejects when rabbis is not an array', () => {
    expect(validateGenerations({ rabbis: 'not-an-array' })).toBe(false);
    expect(validateGenerations({ rabbis: { foo: 'bar' } })).toBe(false);
  });

  it('rejects missing required fields', () => {
    // no nameHe
    expect(validateGenerations({ rabbis: [{ name: 'Hillel', generation: 'zugim' }] })).toBe(false);
    // no generation
    expect(validateGenerations({ rabbis: [{ name: 'Hillel', nameHe: 'הלל' }] })).toBe(false);
    // no name
    expect(validateGenerations({ rabbis: [{ nameHe: 'הלל', generation: 'zugim' }] })).toBe(false);
  });

  it('rejects wrong types on fields', () => {
    expect(validateGenerations({ rabbis: [{ name: 42,     nameHe: 'הלל', generation: 'zugim' }] })).toBe(false);
    expect(validateGenerations({ rabbis: [{ name: 'x',    nameHe: 42,    generation: 'zugim' }] })).toBe(false);
    expect(validateGenerations({ rabbis: [{ name: 'x',    nameHe: 'הלל', generation: 42       }] })).toBe(false);
  });

  it('rejects unknown generation IDs', () => {
    // Someone invents a new era that isn't in the enum.
    expect(validateGenerations({ rabbis: [{ name: 'x', nameHe: 'הלל', generation: 'tanna-9'     }] })).toBe(false);
    expect(validateGenerations({ rabbis: [{ name: 'x', nameHe: 'הלל', generation: 'bavel-amora' }] })).toBe(false);
    expect(validateGenerations({ rabbis: [{ name: 'x', nameHe: 'הלל', generation: ''            }] })).toBe(false);
  });

  it('accepts `unknown` as a valid generation', () => {
    expect(validateGenerations({ rabbis: [{ name: 'x', nameHe: 'הלל', generation: 'unknown' }] })).toBe(true);
  });

  it('is strict — one bad rabbi in a list rejects the whole payload', () => {
    const payload = {
      rabbis: [
        { name: 'Hillel',        nameHe: 'הלל',       generation: 'zugim' },
        { name: 'Invalid',       nameHe: 'פלוני',     generation: 'not-a-real-era' },
      ],
    };
    expect(validateGenerations(payload)).toBe(false);
  });
});
