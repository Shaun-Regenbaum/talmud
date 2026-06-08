import { describe, it, expect } from 'vitest';
import { listDafyomiMasechtos } from '../src/lib/sefref/dafyomi/masechtos';
import { dafyomiWarmTotal } from '../src/worker/warm-cron';

describe('dafyomi gradual-ingestion coverage', () => {
  it('lists the mapped masechtos with resolvable daf bounds (Chullin verified, Shas-wide)', () => {
    const ms = listDafyomiMasechtos();
    expect(ms.length).toBeGreaterThanOrEqual(30);
    // Chullin is the verified pilot and leads the list.
    expect(ms[0].tractate).toBe('Chullin');
    expect(ms.find((m) => m.tractate === 'Chullin')?.verified).toBe(true);
    // Every entry has a positive last daf (so the cursor terminates).
    expect(ms.every((m) => m.lastDaf >= 2)).toBe(true);
    // Common tractates are present.
    const names = ms.map((m) => m.tractate);
    for (const t of ['Berakhot', 'Shabbat', 'Bava Metzia', 'Sanhedrin', 'Niddah']) {
      expect(names).toContain(t);
    }
  });

  it('totals the dapim to walk (sum of lastDaf-1 across masechtos)', () => {
    const total = dafyomiWarmTotal();
    const expected = listDafyomiMasechtos().reduce((s, m) => s + (m.lastDaf - 1), 0);
    expect(total).toBe(expected);
    expect(total).toBeGreaterThan(2000); // all of Bavli
  });
});
