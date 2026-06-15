import { describe, expect, it } from 'vitest';
import { anchorTypeOf } from '../src/client/inspectVocab';
import { variantOf } from '../src/client/runTreeShared';

describe('anchorTypeOf — traditional labels for the anchor types', () => {
  it('maps mark ids to the traditional terms (falls back to the id)', () => {
    expect(anchorTypeOf('argument').label).toBe('Sugya');
    expect(anchorTypeOf('argument-move').label).toBe('Move');
    expect(anchorTypeOf('pesukim').label).toBe('Pasuk');
    expect(anchorTypeOf('halacha').label).toBe('Halacha');
    expect(anchorTypeOf('aggadata').label).toBe('Aggada');
    expect(anchorTypeOf('rabbi').label).toBe('Sage');
    expect(anchorTypeOf('places').label).toBe('Place');
    expect(anchorTypeOf('rishonim').label).toBe('Rishonim');
    expect(anchorTypeOf('__whole_daf__').label).toBe('Daf');
    expect(anchorTypeOf('something-new').label).toBe('something-new');
  });
});

describe('variantOf — computed no longer masquerades as a source', () => {
  it('source / computed / mark / generated are four distinct icons', () => {
    expect(variantOf({ kind: 'source' })).toBe('source');
    // the fix: a deterministic note was previously drawn as a source (database)
    expect(variantOf({ kind: 'computed' })).toBe('computed');
    expect(variantOf({ kind: 'llm', producer: 'mark' })).toBe('mark');
    expect(variantOf({ kind: 'llm', producer: 'enrichment' })).toBe('enrichment');
  });
});
