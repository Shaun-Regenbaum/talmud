import { describe, expect, it } from 'vitest';
import { stripJsonFence } from '../src/worker/llm-helpers';

describe('stripJsonFence', () => {
  it('removes a json fence', () => {
    expect(JSON.parse(stripJsonFence('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
  });
  it('removes a js fence with spaces around it', () => {
    expect(JSON.parse(stripJsonFence('  ```js\n{"a":1}\n```  '))).toEqual({ a: 1 });
  });
  it('leaves bare JSON and broken output alone', () => {
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}');
    expect(stripJsonFence('{"a":')).toBe('{"a":');
  });
});
