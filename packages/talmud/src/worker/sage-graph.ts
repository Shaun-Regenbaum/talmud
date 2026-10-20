import { Hono } from 'hono';
import { canonicalSlug } from '../lib/rabbi/identity';
import { identityCards } from '../lib/sage-graph/identity-readings';
import { initialPlacement } from '../lib/sage-graph/initial-placement';
import {
  type InitialOccurrence,
  type InitialReading,
  initialOccurrences,
  initialPerson,
  type ReadingClaim,
  type ReadingPerson,
} from '../lib/sage-graph/initial-readings';
import { type LegacyPayload, type LegacyRow, legacyCards } from '../lib/sage-graph/legacy-readings';
import {
  POSSIBLE_ERA_SCOPE_SQL,
  type PossibleEra,
  possibleEra,
} from '../lib/sage-graph/possible-era';
import { shareReviewedRelationships } from '../lib/sage-graph/reviewed-relationships';
import {
  applyReadingCoverage,
  type OwnedReadingUnit,
  type ReadingCoverage,
} from '../lib/sage-graph/source-reading-coverage';
import { decodeStoredPassage, type StoredRow } from '../lib/sage-graph/source-reading-store';
import type {
  CheckedConnection,
  CheckedGraph,
  CheckedNode,
  CheckedOccurrence,
} from '../lib/sage-graph/types';
import { resolveSourceStores, type SourceStoreName } from './source-reading-stores';
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

/** Where a passage's initial reading is read from: the graph, or one source-reading store. */
interface ReadingSource {
  db: D1Database;
  revision: string;
  store?: SourceStoreName;
}

async function readInitialPassage(source: ReadingSource, passageId: string) {
  let stored: StoredRow[] = [];
  let found: { kind: string; payload_json: string }[];
  if (source.store) {
    const result = await source.db
      .prepare(
        "SELECT record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json FROM sage_graph_all_records WHERE revision_id=? AND passage_id=? AND authority='screening' AND decision='needs_review' AND kind IN ('person','claim','source_reading','source_reading_coverage','source_reading_unit','passage') ORDER BY record_id LIMIT 401",
      )
      .bind(source.revision, passageId)
      .all<StoredRow>();
    if (result.results.length > 400) throw Error('Too many source reading records');
    if (!result.results.length) return null;
    stored = await decodeStoredPassage(passageId, result.results);
    found = stored;
  } else {
    const result = await source.db
      .prepare(
        "SELECT kind,payload_json FROM sage_graph_all_records WHERE revision_id=? AND passage_id=? AND authority='screening' AND decision='needs_review' AND kind IN ('person','claim','source_reading','source_reading_coverage','passage') ORDER BY record_id LIMIT 401",
      )
      .bind(source.revision, passageId)
      .all<{ kind: string; payload_json: string }>();
    if (result.results.length > 400) throw Error('Too many source reading records');
    found = result.results;
  }
  const rows = found.map((r) => ({ kind: r.kind, data: JSON.parse(r.payload_json) }));
  const provenance = rows.filter((r) => r.kind === 'source_reading');
  if (provenance.length !== 1 || provenance[0].data.version !== 'source-reading-import-v1')
    return null;
  let people = rows.filter((r) => r.kind === 'person').map((r) => r.data as ReadingPerson);
  let claims = rows.filter((r) => r.kind === 'claim').map((r) => r.data as ReadingClaim);
  const coverage = rows.filter((r) => r.kind === 'source_reading_coverage');
  if (coverage.length > 1) throw Error('Conflicting source ownership');
  if (coverage.length) {
    const passage = rows.find((r) => r.kind === 'passage');
    if (!passage) throw Error('Source ownership has no passage');
    ({ people, claims } = applyReadingCoverage(
      passageId,
      provenance[0].data.provenance.jobSha256,
      passage.data.sourceSegments,
      coverage[0].data as ReadingCoverage,
      people,
      claims,
    ));
  }
  return {
    people,
    claims,
    neededContext: provenance[0].data.episode.needed_context as string[],
    stored,
  };
}

/** Which of these record IDs the graph revision holds. */
async function recordsPresent(db: D1Database, revisionId: string, ids: string[]) {
  const present = new Set<string>();
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    const rows = await db
      .prepare(
        `SELECT record_id FROM sage_graph_all_records WHERE revision_id=? AND record_id IN (${batch.map(() => '?').join(',')})`,
      )
      .bind(revisionId, ...batch)
      .all<{ record_id: string }>();
    for (const row of rows.results) present.add(row.record_id);
  }
  return present;
}

async function reviewedPeopleAtSameWords(
  db: D1Database,
  revisionId: string,
  person: ReadingPerson,
) {
  const links = new Map<string, { id: string; name: string }>();
  for (const anchor of person.mentions.filter((m) => m.published ?? m.primary).slice(0, 20)) {
    const candidates = await db
      .prepare(
        "SELECT payload_json FROM sage_graph_all_records WHERE revision_id=? AND kind='name_occurrence' AND authority IN ('source_review','user_correction') AND ref=? LIMIT 101",
      )
      .bind(revisionId, anchor.ref)
      .all<{ payload_json: string }>();
    if (candidates.results.length > 100) continue;
    for (const candidate of candidates.results) {
      const occurrence = JSON.parse(candidate.payload_json);
      if (
        occurrence.quote !== anchor.quote ||
        occurrence.characterStart !== anchor.start ||
        occurrence.characterEnd !== anchor.end
      )
        continue;
      const source = await db
        .prepare(
          "SELECT payload_json FROM sage_graph_all_records WHERE revision_id=? AND record_id=? AND kind='passage'",
        )
        .bind(revisionId, `passage:${occurrence.passageId}`)
        .first<{ payload_json: string }>();
      if (!source) continue;
      const passage = JSON.parse(source.payload_json);
      // Older records without a known edition cannot establish this crosslink.
      const segment = passage.sourceSegments?.find(
        (s: { ref: string; edition: string; sha256: string; text: string }) =>
          s.ref === anchor.ref &&
          s.edition === anchor.edition &&
          s.sha256 === anchor.source_sha256 &&
          s.text === passage.source?.passage,
      );
      if (
        !segment ||
        Array.from(segment.text).slice(anchor.start, anchor.end).join('') !== anchor.quote
      )
        continue;
      const nodeRow = await db
        .prepare(
          "SELECT payload_json FROM sage_graph_all_records WHERE revision_id=? AND record_id=? AND kind='graph_node'",
        )
        .bind(revisionId, `graph_node:${occurrence.personId}`)
        .first<{ payload_json: string }>();
      if (!nodeRow) continue;
      const node = JSON.parse(nodeRow.payload_json);
      if (!node.personKeys?.includes(occurrence.personKey)) continue;
      links.set(occurrence.personId, { id: occurrence.personId, name: node.label });
    }
  }
  return [...links.values()];
}

async function readLegacyPassage(db: D1Database, revisionId: string, passageId: string) {
  const rows = await db
    .prepare(
      "SELECT record_id,kind,passage_id,ref,authority,decision,payload_sha256,payload_json FROM sage_graph_all_records WHERE revision_id=? AND passage_id=? AND kind IN ('passage','person','claim','name_reading','identity_proposal','identity_assessment','source_identity','graph_node','connection','exclusion') ORDER BY record_id LIMIT 801",
    )
    .bind(revisionId, passageId)
    .all<LegacyRow>();
  if (rows.results.length > 800) throw Error('Too many passage records');
  const ids = new Set<string>();
  for (const row of rows.results) {
    const data = JSON.parse(row.payload_json) as LegacyPayload;
    for (const id of Object.keys(data.registryRecords ?? {})) ids.add(id);
    if (row.kind === 'source_identity' && data.personId) ids.add(data.personId);
  }
  if (ids.size > 150) throw Error('Too many possible identities');
  const registry: LegacyRow[] = [];
  const keys = [...ids].map((id) => `registry_person:${id}`);
  for (let start = 0; start < keys.length; start += 50) {
    const batch = keys.slice(start, start + 50);
    const result = await db
      .prepare(
        `SELECT record_id,kind,passage_id,ref,authority,decision,payload_sha256,payload_json FROM sage_graph_all_records WHERE revision_id=? AND record_id IN (${batch.map(() => '?').join(',')}) AND kind='registry_person'`,
      )
      .bind(revisionId, ...batch)
      .all<LegacyRow>();
    registry.push(...result.results);
  }
  const predecessors: LegacyRow[] = [];
  for (const row of rows.results.filter((r) => r.kind === 'identity_proposal')) {
    const block = (
      JSON.parse(row.payload_json) as { referenceCorrection?: { replacesPayloadSha256: string } }
    ).referenceCorrection;
    if (!block) continue;
    const previous = await db
      .prepare(
        'SELECT record_id,kind,passage_id,ref,authority,decision,payload_sha256,payload_json FROM sage_graph_record_versions WHERE record_id=? AND payload_sha256=? LIMIT 2',
      )
      .bind(row.record_id, block.replacesPayloadSha256)
      .all<LegacyRow>();
    predecessors.push(...previous.results);
  }
  const legacy = await legacyCards(revisionId, rows.results, registry);
  const identities = await identityCards(revisionId, [...rows.results, ...registry], predecessors);
  for (const card of identities.cards) {
    const existing = legacy.cards.find((p) => p.id === card.id);
    if (existing?.initialReading && card.initialReading)
      existing.initialReading.proposals?.push(...(card.initialReading.proposals ?? []));
    else legacy.cards.push(card);
  }
  shareReviewedRelationships(legacy.cards, rows.results);
  for (const occurrence of identities.occurrences) {
    const existing = legacy.occurrences.find((o) => o.key === occurrence.key);
    if (existing)
      existing.people.push(
        ...occurrence.people.filter((p) => !existing.people.some((old) => old.id === p.id)),
      );
    else legacy.occurrences.push(occurrence);
  }
  return legacy;
}

sageGraph.get('/initial', async (c) => {
  const db = c.env.SAGE_GRAPH_DB;
  if (!db) return c.json({ error: 'Graph database is unavailable' }, 503);
  const ref = c.req.query('ref')?.trim();
  if (!ref || ref.length > 160 || Array.from(ref).some((character) => character.charCodeAt(0) < 32))
    return c.json({ error: 'Choose a page or passage' }, 400);
  const saved = await revision(db, c.req.query('revision'));
  if (!saved) return c.json({ error: 'No verified graph import was found' }, 404);
  const stores = await resolveSourceStores(c.env, (name) => c.req.query(name));
  if ('error' in stores) return c.json({ error: stores.error }, stores.status);
  const prefix = ref.includes(':') ? ref : `${ref}:`;
  const where = ref.includes(':') ? 'ref=?' : '(ref>=? AND ref<?)';
  const bounds = ref.includes(':') ? [ref] : [prefix, `${prefix}\uffff`];
  const onPage = (value: string) => (ref.includes(':') ? value === ref : value.startsWith(prefix));
  const readingsSql = `SELECT passage_id,kind,payload_json FROM sage_graph_all_records AS r WHERE revision_id=? AND (kind='source_reading_unit' OR (kind='source_reading' AND NOT EXISTS (SELECT 1 FROM sage_graph_all_records AS coverage WHERE coverage.revision_id=r.revision_id AND coverage.record_id='source_reading_coverage:' || r.passage_id))) AND authority='screening' AND decision='needs_review' AND ${where} ORDER BY record_id LIMIT 501`;
  const result = await db
    .prepare(readingsSql)
    .bind(saved.id, ...bounds)
    .all<{ passage_id: string; kind: string; payload_json: string }>();
  const sources = new Map<string, OwnedReadingUnit & { readingPassageIds: string[] }>();
  const addSource = (unit: OwnedReadingUnit, passageId: string) => {
    const previous = sources.get(unit.unitKey);
    if (previous) {
      if (!previous.readingPassageIds.includes(passageId))
        previous.readingPassageIds.push(passageId);
    } else sources.set(unit.unitKey, { ...unit, readingPassageIds: [passageId] });
  };
  for (const row of result.results.filter((r) => r.kind === 'source_reading_unit'))
    addSource(JSON.parse(row.payload_json) as OwnedReadingUnit, row.passage_id);
  const graphSource: ReadingSource = { db, revision: saved.id };
  const readingSources = new Map<string, ReadingSource>(
    result.results.map((row) => [row.passage_id, graphSource]),
  );
  let matched = result.results.length;
  for (const store of stores.stores) {
    const found = await store.db
      .prepare(readingsSql)
      .bind(store.revision, ...bounds)
      .all<{ passage_id: string }>();
    matched += found.results.length;
    if (matched > 500) return c.json({ error: 'Choose one passage to see its readings' }, 422);
    const ids = [...new Set(found.results.map((row) => row.passage_id))].filter(
      (id) => readingSources.get(id) !== graphSource,
    );
    // The graph keeps the older copy of a reading and every human correction, so its copy wins.
    const inGraph = await recordsPresent(
      db,
      saved.id,
      ids.map((id) => `source_reading:${id}`),
    );
    for (const id of ids) {
      if (inGraph.has(`source_reading:${id}`)) readingSources.set(id, graphSource);
      else if (readingSources.has(id))
        return c.json({ error: 'Source reading is stored twice' }, 503);
      else readingSources.set(id, { db: store.db, revision: store.revision, store: store.name });
    }
  }
  const passageIds = [...readingSources.keys()];
  if (matched > 500 || passageIds.length > 50)
    return c.json({ error: 'Choose one passage to see its readings' }, 422);
  const occurrences = new Map<string, InitialOccurrence>();
  const storedRows: LegacyRow[] = [];
  for (const [passageId, source] of readingSources) {
    const passage = await readInitialPassage(source, passageId);
    if (!passage) return c.json({ error: 'Source reading is incomplete' }, 503);
    storedRows.push(...passage.stored);
    for (const row of passage.stored.filter((r) => r.kind === 'source_reading_unit')) {
      const unit = JSON.parse(row.payload_json) as OwnedReadingUnit;
      if (onPage(unit.ref)) addSource(unit, passageId);
    }
    for (const occurrence of initialOccurrences(passageId, passage.people)) {
      if (!onPage(occurrence.ref)) continue;
      const previous = occurrences.get(occurrence.key);
      if (previous)
        previous.people.push(
          ...occurrence.people.filter((p) => !previous.people.some((old) => old.id === p.id)),
        );
      else occurrences.set(occurrence.key, occurrence);
    }
  }
  const older = await db
    .prepare(
      `SELECT DISTINCT passage_id FROM sage_graph_all_records WHERE revision_id=? AND ((kind IN ('name_reading','identity_proposal') AND authority='screening' AND decision='needs_review') OR (kind='source_identity' AND authority IN ('source_review','user_correction') AND decision IN ('accepted_local','accepted_registry_identity'))) AND ${where} ORDER BY passage_id LIMIT 101`,
    )
    .bind(saved.id, ...bounds)
    .all<{ passage_id: string }>();
  if (older.results.length > 100)
    return c.json({ error: 'Choose one passage to see its readings' }, 422);
  for (const row of older.results) {
    const result = await readLegacyPassage(db, saved.id, row.passage_id);
    for (const occurrence of result.occurrences) {
      const previous = occurrences.get(occurrence.key);
      if (previous)
        previous.people.push(
          ...occurrence.people.filter((p) => !previous.people.some((old) => old.id === p.id)),
        );
      else occurrences.set(occurrence.key, occurrence);
    }
  }
  const placementRows: LegacyRow[] = [];
  if (c.req.query('placement') === 'v1') {
    const graphPassages = passageIds.filter((id) => readingSources.get(id) === graphSource);
    for (const pid of new Set([...graphPassages, ...older.results.map((r) => r.passage_id)])) {
      const bound = await db
        .prepare(
          "SELECT record_id,kind,passage_id,ref,authority,decision,payload_sha256,payload_json FROM sage_graph_all_records WHERE revision_id=? AND passage_id=? AND kind IN ('passage','person','source_binding','source_reading_unit','graph_node') ORDER BY record_id LIMIT 401",
        )
        .bind(saved.id, pid)
        .all<LegacyRow>();
      if (bound.results.length > 400)
        return c.json({ error: 'Choose one passage to see its readings' }, 422);
      placementRows.push(...bound.results);
    }
    // Some existing local nodes deliberately have no passage index.
    const nodeKeys = [
      ...new Set(
        [...occurrences.values()]
          .flatMap((o) => o.people)
          .filter((p) => p.id.startsWith('proposal:'))
          .map((p) => `graph_node:local:${p.id.slice('proposal:'.length)}`),
      ),
    ].filter((key) => !placementRows.some((r) => r.record_id === key));
    for (let start = 0; start < nodeKeys.length; start += 50) {
      const batch = nodeKeys.slice(start, start + 50);
      const nodes = await db
        .prepare(
          `SELECT record_id,kind,passage_id,ref,authority,decision,payload_sha256,payload_json FROM sage_graph_all_records WHERE revision_id=? AND kind='graph_node' AND record_id IN (${batch.map(() => '?').join(',')})`,
        )
        .bind(saved.id, ...batch)
        .all<LegacyRow>();
      placementRows.push(...nodes.results);
    }
    // Store passages were decoded once above, from the same store revision.
    placementRows.push(
      ...storedRows.filter((r) => ['passage', 'person', 'source_reading_unit'].includes(r.kind)),
    );
  }
  return c.json({
    ...(c.req.query('placement') === 'v1'
      ? { placement: await initialPlacement([...occurrences.values()], placementRows) }
      : {}),
    revision: saved.id,
    sourceRevisions: stores.revisions,
    ...(stores.unavailable.length ? { unavailableSourceStores: stores.unavailable } : {}),
    occurrences: [...occurrences.values()],
    status: 'initial_proposal',
    sources: [...sources.values()],
  });
});

async function readPossibleEra(db: D1Database, revisionId: string, personKey: string) {
  try {
    const columns =
      'record_id,kind,passage_id,ref,subject_id,object_id,authority,decision,payload_sha256,payload_json';
    const row = await db
      .prepare(`SELECT ${columns} FROM sage_graph_all_records WHERE revision_id=? AND record_id=?`)
      .bind(revisionId, `possible_era:v1/${personKey}`)
      .first<LegacyRow>();
    if (!row) return undefined;
    const saved = JSON.parse(row.payload_json) as PossibleEra;
    if (
      !Array.isArray(saved.dependencies) ||
      saved.dependencies.length > 64 ||
      !saved.dependencies.length
    )
      return undefined;
    const ids = saved.dependencies.map((d) => d.recordId);
    const dependencies = await db
      .prepare(
        `SELECT ${columns} FROM sage_graph_all_records WHERE revision_id=? AND record_id IN (${ids.map(() => '?').join(',')})`,
      )
      .bind(revisionId, ...ids)
      .all<LegacyRow>();
    const scope = await db
      .prepare(POSSIBLE_ERA_SCOPE_SQL)
      .bind(
        revisionId,
        personKey.split('/')[0],
        personKey,
        personKey,
        personKey,
        personKey,
        personKey,
        personKey,
      )
      .all<LegacyRow>();
    if (scope.results.length > 2000) return undefined;
    const byId = new Map([...dependencies.results, ...scope.results].map((r) => [r.record_id, r]));
    return await possibleEra(personKey, row, [...byId.values()]);
  } catch {
    // Missing or stale optional dating hints must not replace the checked person card.
    return undefined;
  }
}

sageGraph.get('/person', async (c) => {
  const db = c.env.SAGE_GRAPH_DB;
  if (!db) return c.json({ error: 'Graph database is unavailable' }, 503);
  const saved = await revision(db, c.req.query('revision'));
  if (!saved) return c.json({ error: 'No verified graph import was found' }, 404);
  const id = c.req.query('id');
  if (id?.startsWith('proposal:')) {
    const match = /^proposal:([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/.exec(id);
    if (!match) return c.json({ error: 'Unknown person' }, 404);
    const result = await readLegacyPassage(db, saved.id, match[1]);
    const person = result.cards.find((person) => person.id === id);
    if (person) person.possibleEra = await readPossibleEra(db, saved.id, `${match[1]}/${match[2]}`);
    return person ? c.json(person) : c.json({ error: 'Unknown person' }, 404);
  }
  if (id?.startsWith('reading:')) {
    const match = /^reading:(sr1-[a-f0-9]{64})\/(p[1-9][0-9]*)$/.exec(id);
    if (!match) return c.json({ error: 'Unknown person' }, 404);
    const stores = await resolveSourceStores(c.env, (name) => c.req.query(name));
    if ('error' in stores) return c.json({ error: stores.error }, stores.status);
    // The graph copy wins: it holds older readings, and human corrections apply there.
    let reading = await readInitialPassage({ db, revision: saved.id }, match[1]);
    let sourceStore: SourceStoreName | undefined;
    if (!reading) {
      for (const store of stores.stores) {
        const found = await readInitialPassage(
          { db: store.db, revision: store.revision, store: store.name },
          match[1],
        );
        if (found && reading) return c.json({ error: 'Source reading is stored twice' }, 503);
        if (found) [reading, sourceStore] = [found, store.name];
      }
      if (!reading && stores.unavailable.length)
        return c.json({ error: 'Source reading store is unavailable' }, 503);
    }
    const person =
      reading &&
      initialPerson(
        saved.id,
        match[1],
        match[2],
        reading.people,
        reading.claims,
        reading.neededContext,
      );
    if (person?.initialReading && reading)
      person.initialReading.reviewedPeople = await reviewedPeopleAtSameWords(
        db,
        saved.id,
        reading.people.find((p) => p.id === match[2])!,
      );
    return person
      ? c.json({ ...person, sourceRevisions: stores.revisions, sourceStore })
      : c.json({ error: 'Unknown person' }, 404);
  }
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
  let readingBasis: InitialReading | undefined;
  let readingBasisUnavailable = false;
  try {
    const readings = await readLegacyPassage(db, saved.id, passageId);
    readingBasis = readings.cards.find((p) => p.id === `proposal:${personKey}`)?.initialReading;
  } catch {
    readingBasisUnavailable = true;
  }
  return c.json({
    readingBasis,
    readingBasisUnavailable,
    possibleEra: await readPossibleEra(db, saved.id, personKey),
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
