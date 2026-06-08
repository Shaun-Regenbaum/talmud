import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeSchema } from '../src/worker/schema-util';
import * as schemas from '../src/worker/output-schemas';

// Golden fixtures are the hand-written JSON-Schema literals as they stood
// before the zod conversion (the production model contract). This asserts each
// zod-derived schema is SEMANTICALLY identical to its frozen original, so the
// conversion cannot silently change what the model sees.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'output-schemas');

describe('output schema parity: zod-generated == frozen literal', () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('every fixture has a matching export', () => {
    const all = schemas as Record<string, unknown>;
    const missing = files.map((f) => f.replace('.json', '')).filter((n) => !all[n]);
    expect(missing).toEqual([]);
    expect(files.length).toBe(49);
  });

  for (const f of files) {
    const name = f.replace('.json', '');
    it(name, () => {
      const golden = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { name: string; strict: boolean; schema: unknown };
      const gen = (schemas as Record<string, { name: string; strict: boolean; schema: unknown }>)[name];
      expect(gen.name).toBe(golden.name);
      expect(gen.strict).toBe(true);
      expect(canonicalizeSchema(gen.schema)).toEqual(canonicalizeSchema(golden.schema));
    });
  }
});
