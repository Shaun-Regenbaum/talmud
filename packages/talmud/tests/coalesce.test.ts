import { describe, expect, it } from 'vitest';
import { coalesce, inflightSize } from '../src/worker/coalesce';

// Regression guard for the cold-daf OOM: many /api/run jobs open at once and
// each loads the same multi-MB source slice. coalesce must collapse concurrent
// same-key loads onto ONE execution (one parsed copy in the isolate) so N
// concurrent runs don't blow the 128 MB per-isolate memory limit.
describe('coalesce', () => {
  it('runs fn ONCE for concurrent same-key callers and shares the result', async () => {
    let calls = 0;
    let release!: (v: { big: string }) => void;
    const gate = new Promise<{ big: string }>((res) => {
      release = res;
    });
    const load = () => {
      calls++;
      return gate;
    };

    const a = coalesce('slice:commentaries:Chullin:53a:false', load);
    const b = coalesce('slice:commentaries:Chullin:53a:false', load);
    const c = coalesce('slice:commentaries:Chullin:53a:false', load);
    expect(inflightSize()).toBe(1);

    const obj = { big: 'x' };
    release(obj);
    const [ra, rb, rc] = await Promise.all([a, b, c]);

    expect(calls).toBe(1); // one shared load, not three copies
    expect(ra).toBe(rb); // same object instance shared across callers
    expect(rb).toBe(rc);
    expect(ra).toBe(obj);
  });

  it('does NOT share across different keys (different daf / bypass)', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      return calls;
    };
    const [x, y] = await Promise.all([
      coalesce('slice:gemara:Chullin:53a:false', load),
      coalesce('slice:gemara:Chullin:53b:false', load),
    ]);
    expect(calls).toBe(2);
    expect(x).not.toBe(y);
  });

  it('drops the in-flight entry on settle (a cache, KV remains the cache)', async () => {
    await coalesce('k1', async () => 1);
    expect(inflightSize()).toBe(0);
    // A later call re-runs (does not serve a stale shared value).
    let ran = false;
    await coalesce('k1', async () => {
      ran = true;
      return 2;
    });
    expect(ran).toBe(true);
  });

  it('propagates rejection to all awaiters and clears the entry', async () => {
    const boom = () => Promise.reject(new Error('load failed'));
    const a = coalesce('k-err', boom);
    const b = coalesce('k-err', boom);
    await expect(a).rejects.toThrow('load failed');
    await expect(b).rejects.toThrow('load failed');
    expect(inflightSize()).toBe(0); // no leak after failure
  });
});
