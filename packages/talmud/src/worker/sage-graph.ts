import { Hono } from 'hono';
import type { Bindings } from './types';

export const sageGraph = new Hono<{ Bindings: Bindings }>();

const NOTE =
  'These records preserve accepted, rejected and unresolved readings. Storage does not confirm an identity. ' +
  'User corrections are separate from the original claims and take precedence over them. ' +
  'Name positions are not ready for the reader until page placement is checked.';

async function revision(db: D1Database, requested?: string) {
  const query = requested
    ? db
        .prepare(
          "SELECT id, manifest_json FROM sage_graph_revisions WHERE state='verified' AND id=?",
        )
        .bind(requested)
    : db.prepare(
        "SELECT id, manifest_json FROM sage_graph_revisions WHERE state='verified' ORDER BY created_at DESC, id DESC LIMIT 1",
      );
  return query.first<{ id: string; manifest_json: string }>();
}

sageGraph.get('/', async (c) => {
  const db = c.env.SAGE_GRAPH_DB;
  if (!db) return c.json({ error: 'Graph database is unavailable' }, 503);
  const saved = await revision(db, c.req.query('revision'));
  if (!saved) return c.json({ error: 'No verified graph import was found' }, 404);
  return c.json({ revision: saved.id, note: NOTE, ...JSON.parse(saved.manifest_json) });
});

sageGraph.get('/records', async (c) => {
  const db = c.env.SAGE_GRAPH_DB;
  if (!db) return c.json({ error: 'Graph database is unavailable' }, 503);
  const limit = Number(c.req.query('limit') ?? '20');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return c.json({ error: 'limit must be an integer from 1 to 50' }, 400);
  }
  const saved = await revision(db, c.req.query('revision'));
  if (!saved) return c.json({ error: 'No verified graph import was found' }, 404);
  const where = ['revision_id=?'];
  const values: (string | number)[] = [saved.id];
  for (const [parameter, column] of [
    ['kind', 'kind'],
    ['passage', 'passage_id'],
    ['ref', 'ref'],
    ['id', 'record_id'],
    ['decision', 'decision'],
  ]) {
    const value = c.req.query(parameter);
    if (value) {
      where.push(`${column}=?`);
      values.push(value);
    }
  }
  const person = c.req.query('person');
  if (person) {
    where.push('(subject_id=? OR object_id=?)');
    values.push(person, person);
  }
  const cursor = c.req.query('after');
  if (cursor) {
    where.push('record_id>?');
    values.push(cursor);
  }
  values.push(limit + 1);
  const result = await db
    .prepare(
      `SELECT record_id, kind, passage_id, ref, authority, decision, payload_sha256, payload_json
     FROM sage_graph_records WHERE ${where.join(' AND ')} ORDER BY record_id LIMIT ?`,
    )
    .bind(...values)
    .all<{
      record_id: string;
      kind: string;
      passage_id: string | null;
      ref: string | null;
      authority: string;
      decision: string | null;
      payload_sha256: string;
      payload_json: string;
    }>();
  const rows = result.results;
  return c.json({
    revision: saved.id,
    note: NOTE,
    nextCursor: rows.length > limit ? rows[limit - 1].record_id : null,
    records: rows.slice(0, limit).map(({ payload_json, ...row }) => ({
      ...row,
      data: JSON.parse(payload_json),
    })),
  });
});
