import { instanceIdOf } from '@corpus/core/cache/keys';
import { describe, expect, it } from 'vitest';
import {
  checkWholeDafLeakAndAlert,
  classifyOffender,
  leakedKeys,
  leakWatchTargets,
  RESIDUE_MIN_AGE_DAYS,
} from '../src/worker/whole-daf-leak-watch';

// The sentinel exists because this leak class shipped twice (#426, #534) and
// burned real money both times, silently. These tests pin its two pure parts:
// which producers it audits, and how it classifies a listed key.

describe('leakWatchTargets', () => {
  it('audits exactly the whole-daf enrichments, each with its current version', () => {
    const targets = leakWatchTargets();
    const ids = targets.map((t) => t.id).sort();
    expect(ids).toEqual(
      [
        'argument-overview.flow',
        'argument-overview.synthesis',
        'biyun.essay',
        'daf-background.concepts',
        'daf-background.synthesis',
        'tidbit.essay',
      ].sort(),
    );
    for (const t of targets) expect(t.version, t.id).toMatch(/^\d+$/);
  });
});

describe('leakedKeys', () => {
  const PREFIX = 'enrich:daf-background.concepts:5:';
  const CANON = 'f35cd02cd97b';

  it('keeps canonical EN and HE keys quiet', () => {
    expect(
      leakedKeys(
        [
          `${PREFIX}${CANON}:chullin:75a`,
          `${PREFIX}he:${CANON}:chullin:75a`,
          `${PREFIX}${CANON}:berakhot:2b`,
        ],
        PREFIX,
        CANON,
      ),
    ).toEqual([]);
  });

  it('flags per-rabbi / per-section keys — the real leak fingerprints', () => {
    const bad = [
      `${PREFIX}rabbi_elazar:chullin:74b`, // rabbi.synthesis parent (seen live)
      `${PREFIX}abaye_s_ruling_on_training_a_minor:chagigah:6a`, // argument section (seen live)
      `${PREFIX}74234e98afe7:arakhin:16a`, // instanceIdOf(undefined) — the bare-run family
      `${PREFIX}he:rava:chullin:74b`, // leaked under the he namespace too
    ];
    expect(leakedKeys([...bad, `${PREFIX}${CANON}:chullin:74b`], PREFIX, CANON)).toEqual(bad);
  });

  it('ignores names outside the prefix (other producers, superseded versions)', () => {
    expect(
      leakedKeys(
        ['enrich:daf-background.concepts:4:rava:chullin:74b', 'enrich:rabbi.synthesis:3:rava:x:y'],
        PREFIX,
        CANON,
      ),
    ).toEqual([]);
  });

  it('the pinned canonical constant IS instanceIdOf({fields:{}})', async () => {
    expect(await instanceIdOf({ fields: {} })).toBe(CANON);
  });
});

// The 07-16 and 08-05 alerts were both pre-fix residue re-alerting daily, not
// live leaks. classifyOffender is the residue/fresh split that lets the
// sentinel self-heal residue while keeping fresh keys screaming.
describe('classifyOffender', () => {
  const NOW = Date.parse('2026-08-05T09:00:00Z');
  const day = 86_400_000;
  const envelope = (createdAt?: string, authority = 'ai') =>
    JSON.stringify({ content: 'x', provenance: { authority, createdAt } });

  it('old key → residue; young key → fresh', () => {
    const old = classifyOffender('k', envelope(new Date(NOW - 48 * day).toISOString()), NOW);
    expect(old.verdict).toBe('residue');
    expect(Math.floor(old.ageDays ?? 0)).toBe(48);
    const young = classifyOffender('k', envelope(new Date(NOW - 1 * day).toISOString()), NOW);
    expect(young.verdict).toBe('fresh');
  });

  it(`the boundary is ${RESIDUE_MIN_AGE_DAYS} days`, () => {
    const justUnder = new Date(NOW - (RESIDUE_MIN_AGE_DAYS * day - 1000)).toISOString();
    const justOver = new Date(NOW - (RESIDUE_MIN_AGE_DAYS * day + 1000)).toISOString();
    expect(classifyOffender('k', envelope(justUnder), NOW).verdict).toBe('fresh');
    expect(classifyOffender('k', envelope(justOver), NOW).verdict).toBe('residue');
  });

  it('no createdAt (pre-#361 value) and unparseable values age as ancient → residue', () => {
    expect(classifyOffender('k', envelope(undefined), NOW).verdict).toBe('residue');
    expect(classifyOffender('k', '{"content":"x"}', NOW).verdict).toBe('residue');
    expect(classifyOffender('k', 'not json at all', NOW).verdict).toBe('residue');
  });

  it('a human-authored artifact is never eviction-eligible, however old', () => {
    const c = classifyOffender(
      'k',
      envelope(new Date(NOW - 400 * day).toISOString(), 'human'),
      NOW,
    );
    expect(c.verdict).toBe('human');
  });

  it('a key that vanished between list and read is gone', () => {
    expect(classifyOffender('k', null, NOW).verdict).toBe('gone');
  });
});

// Wiring test with a fake KV: both real leaks (#426, #534) regressed through
// PLUMBING while logic-level tests stayed green, so drive the actual
// checkWholeDafLeakAndAlert flow: list → classify → evict residue → email.
describe('checkWholeDafLeakAndAlert', () => {
  const NOW = Date.parse('2026-08-05T09:00:00Z');
  const day = 86_400_000;
  const CANON = 'f35cd02cd97b';

  function fakeWorld(seed: Record<string, string>) {
    const store = new Map(Object.entries(seed));
    const deleted: string[] = [];
    const sent: { subject: string; text: string }[] = [];
    const kv = {
      list: async ({ prefix }: { prefix: string }) => ({
        keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
      }),
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
        deleted.push(key);
      },
    };
    const env = {
      CACHE: kv as unknown as KVNamespace,
      EMAIL: {
        send: async (m: { subject: string; text: string }) => {
          sent.push(m);
        },
      },
    };
    return { env, deleted, sent, store };
  }

  const prefix = () => {
    const t = leakWatchTargets().find((t) => t.id === 'daf-background.concepts');
    if (!t) throw new Error('daf-background.concepts not a leak-watch target');
    return `enrich:daf-background.concepts:${t.version}:`;
  };
  const envelope = (ageDaysNum: number, authority = 'ai') =>
    JSON.stringify({
      content: 'x',
      provenance: { authority, createdAt: new Date(NOW - ageDaysNum * day).toISOString() },
    });

  it('evicts residue, keeps fresh + human + canonical, and emails the split once', async () => {
    const p = prefix();
    const { env, deleted, sent } = fakeWorld({
      [`${p}${CANON}:berakhot:2a`]: envelope(60),
      [`${p}rava:pesachim:6a`]: envelope(48),
      [`${p}some_section_title:sanhedrin:74a`]: envelope(1),
      [`${p}manual_note:shabbat:21a`]: envelope(60, 'human'),
    });

    await checkWholeDafLeakAndAlert(env, NOW);

    expect(deleted).toEqual([`${p}rava:pesachim:6a`]);
    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.subject).toContain('LEAK');
    expect(mail.subject).toContain('1 fresh');
    expect(mail.text).toContain('rava:pesachim:6a — written');
    expect(mail.text).toContain('residue, auto-evicted');
    expect(mail.text).toContain('FRESH — live leak?');
    expect(mail.text).toContain('human-authored, kept');
    expect(mail.text).not.toContain(`${CANON}:berakhot:2a`);

    // Same day again: dedupe suppresses a second email, nothing more deleted.
    await checkWholeDafLeakAndAlert(env, NOW + 60_000);
    expect(sent).toHaveLength(1);
    expect(deleted).toHaveLength(1);
  });

  it('all-residue: auto-evicts, sends ONE self-silencing email, then goes quiet', async () => {
    const p = prefix();
    const { env, deleted, sent } = fakeWorld({
      [`${p}${CANON}:berakhot:2a`]: envelope(60),
      [`${p}rava:pesachim:6a`]: envelope(48),
    });

    await checkWholeDafLeakAndAlert(env, NOW);
    expect(deleted).toEqual([`${p}rava:pesachim:6a`]);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('auto-evicted');
    expect(sent[0].text).toContain('no action is needed');

    // Next day: the residue is gone, so no alert at all.
    await checkWholeDafLeakAndAlert(env, NOW + day);
    expect(sent).toHaveLength(1);
  });

  it('a clean family stays silent', async () => {
    const p = prefix();
    const { env, sent } = fakeWorld({
      [`${p}${CANON}:berakhot:2a`]: envelope(60),
      [`${p}he:${CANON}:berakhot:2a`]: envelope(60),
    });
    await checkWholeDafLeakAndAlert(env, NOW);
    expect(sent).toHaveLength(0);
  });
});
