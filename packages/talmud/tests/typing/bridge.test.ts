/**
 * Cross-daf bridge pure logic (src/lib/typing/bridge.ts): the deterministic
 * Hadran short-circuit, the tractate-edge case, the prompt assembly, and the
 * LLM-verdict → DafBridge mapping. (The LLM call + cross-daf loading live in the
 * worker; here we pin the pieces that must be exact.)
 */
import { describe, expect, it } from 'vitest';
import {
  buildBridgePrompt,
  edgeOfTractateBridge,
  hadranBridge,
  llmBridge,
} from '../../src/lib/typing/bridge';

const from = { tractate: 'Shabbat', page: '125b' };
const to = { tractate: 'Shabbat', page: '126a' };

describe('hadranBridge', () => {
  it('blocks continuation when the daf ends with a Hadran (no LLM)', () => {
    expect(hadranBridge(from, to, true)).toEqual({
      from,
      to,
      continues: false,
      kind: 'perek-boundary',
      via: 'hadran',
      note: 'Hadran — perek boundary',
    });
  });
  it('returns null (fall through to LLM) when there is no Hadran', () => {
    expect(hadranBridge(from, to, false)).toBeNull();
  });
});

describe('edgeOfTractateBridge', () => {
  it('no next daf → no bridge', () => {
    expect(edgeOfTractateBridge(from)).toMatchObject({
      to: null,
      continues: false,
      via: 'edge-of-tractate',
    });
  });
});

describe('buildBridgePrompt', () => {
  it("includes both sections' titles, summaries and boundary text", () => {
    const p = buildBridgePrompt(
      { title: 'Carrying out', summary: 'ends mid-dispute', excerpt: 'סוף הסוגיא' },
      { title: 'New case', summary: 'opens a new question', excerpt: 'מתני׳' },
    );
    expect(p).toContain('Carrying out');
    expect(p).toContain('ends mid-dispute');
    expect(p).toContain('סוף הסוגיא');
    expect(p).toContain('New case');
    expect(p).toContain('מתני׳');
    expect(p.toLowerCase()).toContain('continues=true');
  });
});

describe('llmBridge', () => {
  it('maps a continues verdict', () => {
    expect(llmBridge(from, to, { continues: true, note: 'same thread' })).toEqual({
      from,
      to,
      continues: true,
      kind: 'continues',
      via: 'llm',
      note: 'same thread',
    });
  });
  it('maps a non-continues verdict (and a missing/odd continues field is false)', () => {
    expect(llmBridge(from, to, { continues: false, note: 'new topic' }).kind).toBe('new-topic');
    expect(llmBridge(from, to, {}).continues).toBe(false);
    expect(llmBridge(from, to, { continues: 'yes' }).continues).toBe(false); // only strict true counts
  });
});
