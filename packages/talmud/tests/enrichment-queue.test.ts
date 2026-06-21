import { describe, expect, it } from 'vitest';
import {
  isAbort,
  isServiceUnavailableError,
  PAUSED_ERROR,
  parseRunJson,
  QUEUE_PRIORITY,
  RequestQueue,
} from '../src/client/enrichmentQueue';

// Regression guard for the "every card fails with `JSON.parse: unexpected
// character at line 1 column 1`" incident: when a Cloudflare isolate is
// recycled or OOMs, /api/run returns a NON-JSON edge page. A bare r.json()
// crashed; parseRunJson must turn that into a calm, retryable error instead.
describe('parseRunJson', () => {
  it('returns the parsed body for valid JSON (ok and handled-error alike)', async () => {
    const ok = await parseRunJson(new Response(JSON.stringify({ status: 'ok', result: 1 })));
    expect(ok).toEqual({ status: 'ok', result: 1 });
    // A genuine 4xx with a JSON body must still parse (so its real error surfaces).
    const bad = await parseRunJson(
      new Response(JSON.stringify({ error: 'bad input' }), { status: 400 }),
    );
    expect(bad).toEqual({ error: 'bad input' });
  });

  it('throws a transient/retryable error for a Cloudflare 1101 edge page', async () => {
    const r = new Response('error code: 1101', {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    });
    await expect(parseRunJson(r)).rejects.toThrow();
    const err = await parseRunJson(new Response('error code: 1101', { status: 500 })).catch(
      (e) => e,
    );
    // Must be classified transient — NOT a raw parse crash — so the UI shows a
    // retry state and callers retry instead of failing every card.
    expect(isServiceUnavailableError(err)).toBe(true);
  });

  it('throws a transient error for an empty 5xx body', async () => {
    const err = await parseRunJson(new Response('', { status: 503 })).catch((e) => e);
    expect(isServiceUnavailableError(err)).toBe(true);
  });

  it('throws a transient error for an HTML gateway page', async () => {
    const err = await parseRunJson(
      new Response('<!DOCTYPE html><title>502 Bad Gateway</title>', { status: 502 }),
    ).catch((e) => e);
    expect(isServiceUnavailableError(err)).toBe(true);
  });
});

describe('isServiceUnavailableError', () => {
  it('flags AI-provider outages / timeouts (calm "try later" states)', () => {
    for (const m of [
      'OpenRouter HTTP 401: {"error":{"message":"User not found.","code":401}}',
      'OpenRouter HTTP 503',
      'no endpoints found',
      'job abc timed out after 90s',
      'fetch failed',
      'InferenceUpstreamError',
    ]) {
      expect(isServiceUnavailableError(m)).toBe(true);
      expect(isServiceUnavailableError(new Error(m))).toBe(true);
    }
  });

  it('does NOT flag real bugs or the budget-pause sentinel', () => {
    expect(isServiceUnavailableError('schema validation failed: missing field "ref"')).toBe(false);
    expect(isServiceUnavailableError('parse_error: unexpected token')).toBe(false);
    expect(isServiceUnavailableError(PAUSED_ERROR)).toBe(false);
    expect(isServiceUnavailableError('')).toBe(false);
    expect(isServiceUnavailableError(null)).toBe(false);
  });
});

// A manually-resolved promise so tests can control exactly when a task
// finishes and observe queue scheduling deterministically.
function defer<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Drain all pending microtasks (the queue's .then bookkeeping runs as
// microtasks; a macrotask tick flushes the whole synchronous chain).
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('RequestQueue — concurrency', () => {
  it('never runs more than `concurrency` tasks at once', async () => {
    const q = new RequestQueue(2);
    const started: number[] = [];
    const blockers = [defer(), defer(), defer(), defer()];
    for (let i = 0; i < 4; i++) {
      void q.enqueue(`t${i}`, 'l', () => {
        started.push(i);
        return blockers[i].promise;
      });
    }
    // Two slots → exactly two tasks have started; the other two wait.
    expect(started).toEqual([0, 1]);

    blockers[0].resolve('done');
    await flush();
    expect(started).toEqual([0, 1, 2]); // freeing a slot admits the next

    blockers[1].resolve('done');
    await flush();
    expect(started).toEqual([0, 1, 2, 3]);
  });
});

describe('RequestQueue — priority', () => {
  it('drains higher-priority tasks first while a slot is occupied', async () => {
    const q = new RequestQueue(1, 0); // reserve 0: test pure priority ordering
    const order: string[] = [];
    const block = defer();
    // Occupy the only slot, then enqueue out of priority order.
    void q.enqueue('block', 'l', () => {
      order.push('block');
      return block.promise;
    });
    void q.enqueue(
      'low',
      'l',
      () => {
        order.push('low');
        return Promise.resolve('x');
      },
      undefined,
      QUEUE_PRIORITY.low,
    );
    void q.enqueue(
      'high',
      'l',
      () => {
        order.push('high');
        return Promise.resolve('x');
      },
      undefined,
      QUEUE_PRIORITY.high,
    );
    void q.enqueue(
      'normal',
      'l',
      () => {
        order.push('normal');
        return Promise.resolve('x');
      },
      undefined,
      QUEUE_PRIORITY.normal,
    );

    block.resolve('x');
    await flush();
    // After the blocker releases: HIGH, then NORMAL, then LOW.
    expect(order).toEqual(['block', 'high', 'normal', 'low']);
  });

  it('preserves FIFO order within the same priority tier', async () => {
    const q = new RequestQueue(1);
    const order: string[] = [];
    const block = defer();
    void q.enqueue('block', 'l', () => {
      order.push('block');
      return block.promise;
    });
    for (const id of ['a', 'b', 'c']) {
      void q.enqueue(
        id,
        'l',
        () => {
          order.push(id);
          return Promise.resolve('x');
        },
        undefined,
        QUEUE_PRIORITY.normal,
      );
    }
    block.resolve('x');
    await flush();
    expect(order).toEqual(['block', 'a', 'b', 'c']);
  });

  it('a HIGH task enqueued later still jumps ahead of waiting LOW prefetch work', async () => {
    const q = new RequestQueue(1, 0); // reserve 0: isolate priority from the slot reservation
    const order: string[] = [];
    const block = defer();
    void q.enqueue('block', 'l', () => {
      order.push('block');
      return block.promise;
    });
    // Simulate a backlog of prefetch tasks (LOW)...
    for (let i = 0; i < 5; i++) {
      void q.enqueue(
        `pf${i}`,
        'l',
        () => {
          order.push(`pf${i}`);
          return Promise.resolve('x');
        },
        undefined,
        QUEUE_PRIORITY.low,
      );
    }
    // ...then the user opens an anchor (HIGH) after the backlog is queued.
    void q.enqueue(
      'click',
      'l',
      () => {
        order.push('click');
        return Promise.resolve('x');
      },
      undefined,
      QUEUE_PRIORITY.high,
    );

    block.resolve('x');
    await flush();
    expect(order[0]).toBe('block');
    expect(order[1]).toBe('click'); // user click drains before the prefetch backlog
  });
});

describe('RequestQueue — foreground slot reservation', () => {
  it('LOW (background prefetch) cannot occupy the reserved slot', async () => {
    const q = new RequestQueue(2, 1); // 2 slots, reserve 1 → LOW may use at most 1
    const started: string[] = [];
    const blockers = [defer(), defer(), defer()];
    for (let i = 0; i < 3; i++) {
      void q.enqueue(
        `low${i}`,
        'l',
        () => {
          started.push(`low${i}`);
          return blockers[i].promise;
        },
        undefined,
        QUEUE_PRIORITY.low,
      );
    }
    // Only one LOW runs; the second slot stays reserved for foreground.
    expect(started).toEqual(['low0']);

    // A foreground click (HIGH) takes the reserved slot immediately — it does
    // NOT wait behind the in-flight LOW prefetch.
    const hi = defer();
    void q.enqueue(
      'click',
      'l',
      () => {
        started.push('click');
        return hi.promise;
      },
      undefined,
      QUEUE_PRIORITY.high,
    );
    expect(started).toEqual(['low0', 'click']);

    // When the running LOW finishes, the next LOW may use its (non-reserved) slot.
    blockers[0].resolve('x');
    await flush();
    expect(started).toContain('low1');
  });

  it('NORMAL foreground work is not capped by the reservation', async () => {
    const q = new RequestQueue(2, 1);
    const started: string[] = [];
    const b = [defer(), defer()];
    // Two NORMAL tasks may use both slots — the reserve only restrains LOW.
    void q.enqueue(
      'n0',
      'l',
      () => {
        started.push('n0');
        return b[0].promise;
      },
      undefined,
      QUEUE_PRIORITY.normal,
    );
    void q.enqueue(
      'n1',
      'l',
      () => {
        started.push('n1');
        return b[1].promise;
      },
      undefined,
      QUEUE_PRIORITY.normal,
    );
    expect(started).toEqual(['n0', 'n1']);
  });
});

describe('RequestQueue — abort', () => {
  it('rejects an already-aborted task without running it or burning a slot', async () => {
    const q = new RequestQueue(1);
    const ac = new AbortController();
    ac.abort();
    let ran = false;
    let err: unknown;
    await q
      .enqueue(
        'aborted',
        'l',
        () => {
          ran = true;
          return Promise.resolve('x');
        },
        ac.signal,
      )
      .catch((e) => {
        err = e;
      });
    expect(ran).toBe(false);
    expect(isAbort(err)).toBe(true);

    // The slot was not leaked — a subsequent task still runs.
    let ranNext = false;
    await q.enqueue('next', 'l', () => {
      ranNext = true;
      return Promise.resolve('y');
    });
    expect(ranNext).toBe(true);
  });

  it('passes a real AbortSignal into the running task', async () => {
    const q = new RequestQueue(1);
    let received: AbortSignal | undefined;
    await q.enqueue('s', 'l', (signal) => {
      received = signal;
      return Promise.resolve('x');
    });
    expect(received).toBeInstanceOf(AbortSignal);
    expect(received!.aborted).toBe(false);
  });

  it('an aborted waiting task does not block higher-priority work behind it', async () => {
    const q = new RequestQueue(1);
    const order: string[] = [];
    const block = defer();
    const ac = new AbortController();
    ac.abort();
    void q.enqueue('block', 'l', () => {
      order.push('block');
      return block.promise;
    });
    // Aborted task waiting in the queue.
    void q
      .enqueue(
        'dead',
        'l',
        () => {
          order.push('dead');
          return Promise.resolve('x');
        },
        ac.signal,
      )
      .catch(() => {});
    // Live task behind it.
    void q.enqueue('live', 'l', () => {
      order.push('live');
      return Promise.resolve('x');
    });

    block.resolve('x');
    await flush();
    expect(order).toContain('live');
    expect(order).not.toContain('dead');
  });
});
