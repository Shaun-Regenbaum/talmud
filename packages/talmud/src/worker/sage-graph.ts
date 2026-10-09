import { Hono } from 'hono';
import { canonicalSlug } from '../lib/rabbi/identity';
import type {
  CheckedConnection,
  CheckedGraph,
  CheckedNode,
  CheckedOccurrence,
} from '../lib/sage-graph/types';
import { isKnownTractate } from './spine-coverage';
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
     FROM sage_graph_all_records WHERE ${where.join(' AND ')} ORDER BY record_id LIMIT ?`,
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

sageGraph.get('/checked', async (c) => {
  const db = c.env.SAGE_GRAPH_DB;
  if (!db) return c.json({ error: 'Graph database is unavailable' }, 503);
  const rawPerson = c.req.query('person');
  const person = rawPerson ? canonicalSlug(rawPerson) : undefined;
  const tractate = c.req.query('tractate');
  const page = c.req.query('page');
  if ((!person && (!tractate || !page)) || (person && (tractate || page))) {
    return c.json({ error: 'Choose a person or a tractate and page' }, 400);
  }
  if (!person && (!isKnownTractate(tractate!) || !/^\d+[ab]$/.test(page!))) {
    return c.json({ error: 'Unknown page' }, 400);
  }
  const saved = await revision(db, c.req.query('revision'));
  if (!saved) return c.json({ error: 'No verified graph import was found' }, 404);
  const prefix = `${tractate} ${page}:`;
  const where = person ? '(subject_id=? OR object_id=?)' : '(ref>=? AND ref<?)';
  const filter = person ? [person, person] : [prefix, `${prefix}\uffff`];
  const result = await db
    .prepare(
      `SELECT record_id,payload_json FROM sage_graph_all_records WHERE revision_id=? AND kind='connection'
     AND authority IN ('user_correction','source_review') AND decision='supported' AND ${where} AND record_id>? ORDER BY record_id LIMIT 21`,
    )
    .bind(saved.id, ...filter, c.req.query('after') ?? '')
    .all<{ record_id: string; payload_json: string }>();
  const main = result.results.slice(0, 20);
  const connections = main.map((r) => JSON.parse(r.payload_json) as CheckedConnection);
  const read = async (ids: string[]) => {
    const rows: { record_id: string; payload_json: string }[] = [];
    const unique = [...new Set(ids)];
    for (let start = 0; start < unique.length; start += 50) {
      const chunk = unique.slice(start, start + 50);
      const data = await db
        .prepare(
          `SELECT record_id,payload_json FROM sage_graph_all_records WHERE revision_id=? AND record_id IN (${chunk.map(() => '?').join(',')})`,
        )
        .bind(saved.id, ...chunk)
        .all<{ record_id: string; payload_json: string }>();
      rows.push(...data.results);
    }
    return new Map(rows.map((r) => [r.record_id, JSON.parse(r.payload_json)]));
  };
  const premiseIds = connections
    .flatMap((r) => r.premiseConnectionIds ?? [])
    .filter((id) => !connections.some((r) => r.id === id));
  const premises = await read(premiseIds.map((id) => `connection:${id}`));
  if (premises.size !== new Set(premiseIds).size)
    return c.json({ error: 'Missing supporting connection' }, 503);
  const supporting = [...premises.values()] as CheckedConnection[];
  const all = [...connections, ...supporting];
  const nodeIds = [...new Set(all.flatMap((r) => [r.a, r.b]))];
  const nodeRows = await read(nodeIds.map((id) => `graph_node:${id}`));
  if (nodeRows.size !== nodeIds.length) return c.json({ error: 'Missing person record' }, 503);
  const occurrenceRows = person
    ? []
    : (
        await db
          .prepare(
            "SELECT payload_json FROM sage_graph_all_records WHERE revision_id=? AND kind='name_occurrence' AND ref>=? AND ref<? ORDER BY record_id LIMIT 101",
          )
          .bind(saved.id, prefix, `${prefix}\uffff`)
          .all<{ payload_json: string }>()
      ).results;
  const occurrences =
    occurrenceRows.length > 100
      ? []
      : occurrenceRows.map((r) => JSON.parse(r.payload_json) as CheckedOccurrence);
  const passageIds = [
    ...new Set([...all.map((r) => r.passageId), ...occurrences.map((r) => r.passageId)]),
  ];
  const passages = await read(passageIds.map((id) => `passage:${id}`));
  const registryIds = [
    ...nodeIds.filter((id) => nodeRows.get(`graph_node:${id}`).identityResolved),
    ...occurrences.map((r) => r.personId),
  ];
  const registry = await read(registryIds.map((id) => `registry_person:${id}`));
  const nodes: CheckedNode[] = nodeIds.map((id) => {
    const node = nodeRows.get(`graph_node:${id}`);
    const personRecord = registry.get(`registry_person:${id}`);
    const key = node.personKeys?.[0] as string | undefined;
    const [pid, local] = key?.split('/') ?? [];
    const sourcePerson = passages
      .get(`passage:${pid}`)
      ?.people?.find((p: { id: string }) => p.id === local);
    return {
      id,
      name: personRecord?.canonical ?? node.label,
      nameHe:
        node.labelHe ??
        personRecord?.canonicalHe ??
        (/[א-ת]/.test(node.label) ? node.label : (sourcePerson?.quote ?? node.label)),
      identityResolved: node.identityResolved,
      hasSourceProfile:
        !!node.sourceProfile ||
        (id === `local:${key}` &&
          sourcePerson?.quoteLocation === 'passage' &&
          !!sourcePerson.quote &&
          !!passages.get(`passage:${pid}`)?.source?.passage?.includes(sourcePerson.quote)),
      generation: node.generation,
    };
  });
  const occurrenceNodes = await read(
    occurrences
      .filter((r) => r.personId.startsWith('local:'))
      .map((r) => `graph_node:${r.personId}`),
  );
  const safeOccurrences = occurrences.flatMap((row) => {
    const source = passages.get(`passage:${row.passageId}`)?.source?.passage;
    const entry = registry.get(`registry_person:${row.personId}`);
    const local = occurrenceNodes.get(`graph_node:${row.personId}`);
    const sourceProfile =
      local?.sourceProfile && local.personKeys?.includes(row.personKey)
        ? local.sourceProfile
        : undefined;
    if (
      typeof source !== 'string' ||
      (!entry && !sourceProfile) ||
      source.slice(row.characterStart, row.characterEnd) !== row.quote
    )
      return [];
    return [{ ...row, source, name: entry?.canonical ?? sourceProfile.name }];
  });
  const body: CheckedGraph = {
    revision: saved.id,
    connections,
    supporting,
    nodes,
    occurrences: safeOccurrences,
    occurrencesTruncated: occurrenceRows.length > 100,
    nextCursor: result.results.length > 20 ? main[main.length - 1].record_id : null,
  };
  return c.json(body);
});

sageGraph.get('/person', async (c) => {
  const db = c.env.SAGE_GRAPH_DB;
  if (!db) return c.json({ error: 'Graph database is unavailable' }, 503);
  const saved = await revision(db, c.req.query('revision'));
  if (!saved) return c.json({ error: 'No verified graph import was found' }, 404);
  const id = c.req.query('id');
  if (!id?.startsWith('local:')) return c.json({ error: 'Unknown person' }, 404);
  const row = await db
    .prepare(
      "SELECT payload_json FROM sage_graph_all_records WHERE revision_id=? AND record_id=? AND kind='graph_node'",
    )
    .bind(saved.id, `graph_node:${id}`)
    .first<{ payload_json: string }>();
  const node = row ? JSON.parse(row.payload_json) : null;
  let profile = node?.sourceProfile;
  const personKey = profile?.personKey ?? id.slice('local:'.length);
  if (!node?.personKeys?.includes(personKey)) return c.json({ error: 'Unknown person' }, 404);
  const [passageId, localId] = personKey.split('/');
  const sourceRow = await db
    .prepare(
      "SELECT payload_json FROM sage_graph_all_records WHERE revision_id=? AND record_id=? AND kind='passage'",
    )
    .bind(saved.id, `passage:${passageId}`)
    .first<{ payload_json: string }>();
  const passage = sourceRow ? JSON.parse(sourceRow.payload_json) : null;
  if (!profile) {
    const person = passage?.people?.find((p: { id: string }) => p.id === localId);
    if (!person?.quote || person.quoteLocation !== 'passage')
      return c.json({ error: 'Source could not be checked' }, 503);
    // A passage-local card needs no historical biography or proposed identity.
    // Keep the saved label and exact name quote; leave unsourced fields empty.
    profile = {
      personKey,
      name: node.label,
      nameHe: /[א-ת]/.test(node.label) ? node.label : person.quote,
      quote: person.quote,
      summary: '',
      summaryHe: '',
      places: [],
    };
  }
  if (!passage?.source?.passage?.includes(profile.quote))
    return c.json({ error: 'Source could not be checked' }, 503);
  const places = [];
  if ((profile.places ?? []).length > 50)
    return c.json({ error: 'Too many place sources for one profile' }, 503);
  for (const place of profile.places ?? []) {
    const row = await db
      .prepare(
        "SELECT payload_json FROM sage_graph_all_records WHERE revision_id=? AND record_id=? AND kind='passage'",
      )
      .bind(saved.id, `passage:${place.passageId}`)
      .first<{ payload_json: string }>();
    const source = row ? JSON.parse(row.payload_json) : null;
    if (
      !place.quote ||
      source?.ref !== place.ref ||
      !source?.source?.passage?.includes(place.quote)
    )
      return c.json({ error: 'Place source could not be checked' }, 503);
    places.push(place);
  }
  const era = profile.era;
  if (
    era &&
    (!Number.isInteger(era.start) ||
      !Number.isInteger(era.end) ||
      era.end <= era.start ||
      !era.label ||
      !era.labelHe ||
      !/^https:\/\//.test(era.source?.url ?? ''))
  )
    return c.json({ error: 'Era source could not be checked' }, 503);
  return c.json({
    revision: saved.id,
    id,
    era,
    generation: profile.generation,
    resolvedTo: profile.resolvedTo,
    places,
    name: profile.name,
    nameHe: profile.nameHe,
    summary: profile.summary,
    summaryHe: profile.summaryHe,
    ref: passage.ref,
    quote: profile.quote,
  });
});
