import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = process.argv[2];
assert.ok(['talmud', 'tanach'].includes(app));
// `wrangler deploy` follows .wrangler/deploy/config.json, so check the file it
// points at is the one checked here.
const pointer = JSON.parse(await readFile(`packages/${app}/.wrangler/deploy/config.json`, 'utf8'));
assert.equal(pointer.configPath, `../../dist/${app}/wrangler.json`);
const config = JSON.parse(await readFile(`packages/${app}/dist/${app}/wrangler.json`, 'utf8'));
assert.equal(config.name, `${app}-staging`);
assert.equal(config.vars.APP_ENV, 'staging');
assert.deepEqual(config.routes, [{ pattern: `staging.${app}.dev`, custom_domain: true }]);
const namespace =
  app === 'talmud' ? '74de4dafe9e94071bcce4ac2873ba043' : 'e4fab94968a64e3c8626a101edce9280';
assert.deepEqual(config.kv_namespaces, [{ binding: 'CACHE', id: namespace }]);
assert.equal(config.d1_databases.length, 1);
assert.equal(config.d1_databases[0].database_id, '49930fc7-f92a-446b-886d-0ec8ae882dc6');
assert.equal(config.send_email.length, 0);
assert.deepEqual(config.triggers.crons, []);
if (app === 'talmud') {
  // Talmud staging generates on its own generator script and queue, never
  // production's.
  assert.deepEqual(config.ai, { binding: 'AI' });
  assert.deepEqual(
    config.workflows.map((w) => [w.binding, w.name, w.script_name]),
    [['DAF_WARM_WORKFLOW', 'daf-warm-gen-staging', 'talmud-gen-staging']],
  );
  assert.deepEqual(
    config.queues.producers.map((q) => [q.binding, q.queue]),
    [['ENRICHMENT_QUEUE', 'enrichment-jobs-staging']],
  );
  assert.deepEqual(config.queues.consumers ?? [], []);
  assert.equal(config.vars.DAILY_BUDGET_USD, '20');
} else {
  assert.equal(config.ai, undefined);
  assert.equal(config.workflows.length, 0);
  assert.deepEqual(config.queues, { producers: [], consumers: [] });
}
assert.ok(
  config.services.every((s) => ['corpus-staging-source', 'talmud-staging'].includes(s.service)),
);
console.log(`${app}: staging bindings verified`);
