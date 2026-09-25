/**
 * The Studio definition registry, as HTTP: the mark CRUD (GET /api/marks,
 * GET/PUT/DELETE /api/marks/:id) and the enrichment CRUD (GET /api/enrichments,
 * GET/PUT/DELETE /api/enrichments/:id).
 *
 * The two groups are registered far apart in the worker and Hono matches in
 * registration order, so they are exported as two register functions and each
 * is still called from where its routes used to sit.
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import type { Hono } from 'hono';
import { CODE_ENRICHMENTS, CODE_MARKS, findCodeEnrichment, findCodeMark } from '../code-marks';
import { readJsonBody } from '../http-helpers';
import {
  deleteEnrichment,
  deleteMark,
  type EnrichmentDefinition,
  listEnrichments,
  listMarks,
  readEnrichment,
  readMark,
  validateEnrichment,
  validateMark,
  writeEnrichment,
  writeMark,
} from '../studio-registry';
import type { Bindings } from '../types';

export function registerMarkDefRoutes(app: Hono<{ Bindings: Bindings }>): void {
  /**
   * Studio: KV-backed mark + enrichment registries. Definitions live under
   *   mark-defs:v1:{id}        — what to extract from a daf
   *   enrichment-defs:v1:{id}  — what to derive from a mark
   *
   * Ad-hoc runs (no save) hit /api/run with an inline definition. Saved
   * runs reference an id and get cached. The same registry powers Home (all
   * registered enrichments shown as toggles, off by default) and Studio
   * (per-enrichment editor + preview).
   */
  app.get('/api/marks', async (c) => {
    // Merge KV-stored marks with code-defined seeds. KV wins on id collision
    // (a saved KV definition overrides a built-in with the same id).
    const kv = await listMarks(c.env);
    const kvIds = new Set(kv.map((m) => m.id));
    const merged = [...CODE_MARKS.filter((m) => !kvIds.has(m.id)), ...kv];
    return c.json({ marks: merged });
  });
  app.get('/api/marks/:id', async (c) => {
    const id = c.req.param('id');
    const kv = await readMark(c.env, id);
    if (kv) return c.json({ mark: kv });
    const code = findCodeMark(id);
    if (code) return c.json({ mark: code });
    return c.json({ error: 'not found' }, 404);
  });
  app.put('/api/marks/:id', async (c) => {
    const parsed = await readJsonBody(c);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const v = validateMark({ ...(body as object), id: c.req.param('id') });
    if (!v.ok) return c.json({ error: v.error }, 400);
    const saved = await writeMark(c.env, v.spec);
    return c.json({ mark: saved });
  });
  app.delete('/api/marks/:id', async (c) => {
    await deleteMark(c.env, c.req.param('id'));
    return c.json({ ok: true });
  });
}

export function registerEnrichmentDefRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.get('/api/enrichments', async (c) => {
    // Merge KV + code-defined. KV wins on collision. Code-defined entries are
    // normalized to the KV-flat shape (extractor flattened, `mark` instead of
    // `target_mark`) so the client gets one consistent shape.
    const kv = await listEnrichments(c.env);
    const kvIds = new Set(kv.map((e) => e.id));
    const codeFlat: Array<EnrichmentDefinition & { mode?: string }> = CODE_ENRICHMENTS.filter(
      (e) => !kvIds.has(e.id),
    )
      .filter((e) => e.extractor.kind === 'llm')
      .map((e) => ({
        id: e.id,
        label: e.label,
        description: e.description,
        mark: e.target_mark,
        mode: e.mode,
        scope: e.scope,
        dependencies: e.dependencies,
        system_prompt: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).system_prompt,
        user_prompt_template: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>)
          .user_prompt_template,
        model: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).model,
        output_schema: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).output_schema,
        thinking_off: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>).thinking_off,
        reasoning_effort: (e.extractor as Extract<typeof e.extractor, { kind: 'llm' }>)
          .reasoning_effort,
        cache_version: e.cache_version,
        source: 'code',
        updated_at: e.updated_at,
      }));
    return c.json({ enrichments: [...codeFlat, ...kv] });
  });
  app.get('/api/enrichments/:id', async (c) => {
    const id = c.req.param('id');
    const kv = await readEnrichment(c.env, id);
    if (kv) return c.json({ enrichment: kv });
    const code = findCodeEnrichment(id);
    if (code) return c.json({ enrichment: code });
    return c.json({ error: 'not found' }, 404);
  });
  app.put('/api/enrichments/:id', async (c) => {
    const parsed = await readJsonBody(c);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const v = validateEnrichment({ ...(body as object), id: c.req.param('id') });
    if (!v.ok) return c.json({ error: v.error }, 400);
    const saved = await writeEnrichment(c.env, v.spec);
    return c.json({ enrichment: saved });
  });
  app.delete('/api/enrichments/:id', async (c) => {
    await deleteEnrichment(c.env, c.req.param('id'));
    return c.json({ ok: true });
  });
}
