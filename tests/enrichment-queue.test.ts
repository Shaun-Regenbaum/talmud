import { describe, it, expect } from 'vitest';
import { RequestQueue, QUEUE_PRIORITY, isAbort } from '../src/client/enrichmentQueue';

// A manually-resolved promise so tests can control exactly when a task
// finishes and observe queue scheduling deterministically.
function defer<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
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
      void q.enqueue(`t${i}`, 'l', () => { started.push(i); return blockers[i].promise; });
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
    const q = new RequestQueue(1);
    const order: string[] = [];
    const block = defer();
    // Occupy the only slot, then enqueue out of priority order.
    void q.enqueue('block', 'l', () => { order.push('block'); return block.promise; });
    void q.enqueue('low', 'l', () => { order.push('low'); return Promise.resolve('x'); }, undefined, QUEUE_PRIORITY.low);
    void q.enqueue('high', 'l', () => { order.push('high'); return Promise.resolve('x'); }, undefined, QUEUE_PRIORITY.high);
    void q.enqueue('normal', 'l', () => { order.push('normal'); return Promise.resolve('x'); }, undefined, QUEUE_PRIORITY.normal);

    block.resolve('x');
    await flush();
    // After the blocker releases: HIGH, then NORMAL, then LOW.
    expect(order).toEqual(['block', 'high', 'normal', 'low']);
  });

  it('preserves FIFO order within the same priority tier', async () => {
    const q = new RequestQueue(1);
    const order: string[] = [];
    const block = defer();
    void q.enqueue('block', 'l', () => { order.push('block'); return block.promise; });
    for (const id of ['a', 'b', 'c']) {
      void q.enqueue(id, 'l', () => { order.push(id); return Promise.resolve('x'); }, undefined, QUEUE_PRIORITY.normal);
    }
    block.resolve('x');
    await flush();
    expect(order).toEqual(['block', 'a', 'b', 'c']);
  });

  it('a HIGH task enqueued later still jumps ahead of waiting LOW prefetch work', async () => {
    const q = new RequestQueue(1);
    const order: string[] = [];
    const block = defer();
    void q.enqueue('block', 'l', () => { order.push('block'); return block.promise; });
    // Simulate a backlog of prefetch tasks (LOW)...
    for (let i = 0; i < 5; i++) {
      void q.enqueue(`pf${i}`, 'l', () => { order.push(`pf${i}`); return Promise.resolve('x'); }, undefined, QUEUE_PRIORITY.low);
    }
    // ...then the user opens an anchor (HIGH) after the backlog is queued.
    void q.enqueue('click', 'l', () => { order.push('click'); return Promise.resolve('x'); }, undefined, QUEUE_PRIORITY.high);

    block.resolve('x');
    await flush();
    expect(order[0]).toBe('block');
    expect(order[1]).toBe('click'); // user click drains before the prefetch backlog
  });
});

describe('RequestQueue — abort', () => {
  it('rejects an already-aborted task without running it or burning a slot', async () => {
    const q = new RequestQueue(1);
    const ac = new AbortController();
    ac.abort();
    let ran = false;
    let err: unknown;
    await q.enqueue('aborted', 'l', () => { ran = true; return Promise.resolve('x'); }, ac.signal)
      .catch((e) => { err = e; });
    expect(ran).toBe(false);
    expect(isAbort(err)).toBe(true);

    // The slot was not leaked — a subsequent task still runs.
    let ranNext = false;
    await q.enqueue('next', 'l', () => { ranNext = true; return Promise.resolve('y'); });
    expect(ranNext).toBe(true);
  });

  it('passes a real AbortSignal into the running task', async () => {
    const q = new RequestQueue(1);
    let received: AbortSignal | undefined;
    await q.enqueue('s', 'l', (signal) => { received = signal; return Promise.resolve('x'); });
    expect(received).toBeInstanceOf(AbortSignal);
    expect(received!.aborted).toBe(false);
  });

  it('an aborted waiting task does not block higher-priority work behind it', async () => {
    const q = new RequestQueue(1);
    const order: string[] = [];
    const block = defer();
    const ac = new AbortController();
    ac.abort();
    void q.enqueue('block', 'l', () => { order.push('block'); return block.promise; });
    // Aborted task waiting in the queue.
    void q.enqueue('dead', 'l', () => { order.push('dead'); return Promise.resolve('x'); }, ac.signal).catch(() => {});
    // Live task behind it.
    void q.enqueue('live', 'l', () => { order.push('live'); return Promise.resolve('x'); });

    block.resolve('x');
    await flush();
    expect(order).toContain('live');
    expect(order).not.toContain('dead');
  });
});
