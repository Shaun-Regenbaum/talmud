import { describe, expect, it } from 'vitest';
import { splitPrefetchTasks } from '../src/client/dafPrefetch';

const t = (enrichmentId: string) => ({ enrichmentId });

describe('splitPrefetchTasks', () => {
  const tasks = [
    t('argument.synthesis'),
    t('argument-move.synthesis'),
    t('halacha.synthesis'),
    t('argument.synthesis'),
  ];

  it('asks for everything when the background job is not running', () => {
    expect(splitPrefetchTasks(tasks, false)).toEqual({ run: tasks, skip: [] });
  });

  it('while the job runs, still asks for the section notes the job never makes', () => {
    const { run, skip } = splitPrefetchTasks(tasks, true);
    expect(run.map((x) => x.enrichmentId)).toEqual(['argument.synthesis', 'argument.synthesis']);
    expect(skip.map((x) => x.enrichmentId)).toEqual([
      'argument-move.synthesis',
      'halacha.synthesis',
    ]);
  });

  it('loses no task either way', () => {
    for (const driven of [true, false]) {
      const { run, skip } = splitPrefetchTasks(tasks, driven);
      expect(run.length + skip.length).toBe(tasks.length);
    }
  });
});
