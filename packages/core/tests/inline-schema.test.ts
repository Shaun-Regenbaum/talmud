import { describe, expect, it } from 'vitest';
import { inlineSchemaForFirstParty, type LLMMessage } from '../src/llm/llm';

const SCHEMA_WRAPPER = {
  name: 'test_shape',
  strict: true,
  schema: {
    type: 'object',
    required: ['ok'],
    properties: { ok: { type: 'boolean' } },
  },
};
const JSON_SCHEMA_RF = { type: 'json_schema' as const, json_schema: SCHEMA_WRAPPER };

const msgs = (): LLMMessage[] => [
  { role: 'system', content: 'You are the extractor.' },
  { role: 'user', content: 'Extract from this daf.' },
];

describe('inlineSchemaForFirstParty', () => {
  it('converts json_schema to json_object and inlines the inner schema for v4-pro', () => {
    const input = msgs();
    const { messages, response_format } = inlineSchemaForFirstParty(
      'deepseek/deepseek-v4-pro',
      input,
      JSON_SCHEMA_RF,
    );
    expect(response_format).toEqual({ type: 'json_object' });
    expect(messages[0].content).toContain('You are the extractor.');
    expect(messages[0].content).toContain('conform to this JSON Schema');
    expect(messages[0].content).toContain(JSON.stringify(SCHEMA_WRAPPER.schema));
    // the wrapper's name/strict metadata is not injected, only the schema
    expect(messages[0].content).not.toContain('test_shape');
    // user message untouched; original array not mutated
    expect(messages[1]).toEqual(input[1]);
    expect(input[0].content).toBe('You are the extractor.');
  });

  it('mentions JSON in the injected text (DeepSeek json_object requirement)', () => {
    const { messages } = inlineSchemaForFirstParty(
      'deepseek/deepseek-v4-pro',
      msgs(),
      JSON_SCHEMA_RF,
    );
    expect(messages[0].content).toMatch(/JSON/);
  });

  it('appends to the LAST system message, never the leading preamble', () => {
    const input: LLMMessage[] = [
      { role: 'system', content: 'DAF PREAMBLE' },
      { role: 'system', content: 'You are the extractor.' },
      { role: 'user', content: 'Extract.' },
    ];
    const { messages } = inlineSchemaForFirstParty(
      'deepseek/deepseek-v4-pro',
      input,
      JSON_SCHEMA_RF,
    );
    expect(messages[0].content).toBe('DAF PREAMBLE');
    expect(messages[1].content).toContain('conform to this JSON Schema');
    expect(messages[2].content).toBe('Extract.');
  });

  it('prepends a system message when none exists', () => {
    const { messages } = inlineSchemaForFirstParty(
      'deepseek/deepseek-v4-pro',
      [{ role: 'user', content: 'Extract.' }],
      JSON_SCHEMA_RF,
    );
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('conform to this JSON Schema');
    expect(messages[1].content).toBe('Extract.');
  });

  it('tolerates a raw schema without the OpenAI wrapper', () => {
    const raw = { type: 'object', properties: { x: { type: 'string' } } };
    const { messages } = inlineSchemaForFirstParty('deepseek/deepseek-v4-pro', msgs(), {
      type: 'json_schema',
      json_schema: raw,
    });
    expect(messages[0].content).toContain(JSON.stringify(raw));
  });

  it('converts flash too (first-party-preferred like every deepseek slug)', () => {
    const out = inlineSchemaForFirstParty('deepseek/deepseek-v4-flash', msgs(), JSON_SCHEMA_RF);
    expect(out.response_format).toEqual({ type: 'json_object' });
    expect(out.messages[0].content).toContain('conform to this JSON Schema');
  });

  it('leaves non-deepseek slugs untouched', () => {
    const input = msgs();
    const out = inlineSchemaForFirstParty('anthropic/claude-sonnet-4.5', input, JSON_SCHEMA_RF);
    expect(out.response_format).toBe(JSON_SCHEMA_RF);
    expect(out.messages).toBe(input);
  });

  it('leaves json_object and absent response_format untouched', () => {
    const input = msgs();
    const a = inlineSchemaForFirstParty('deepseek/deepseek-v4-pro', input, {
      type: 'json_object',
    });
    expect(a.response_format).toEqual({ type: 'json_object' });
    expect(a.messages).toBe(input);
    const b = inlineSchemaForFirstParty('deepseek/deepseek-v4-pro', input, undefined);
    expect(b.response_format).toBeUndefined();
    expect(b.messages).toBe(input);
  });
});
