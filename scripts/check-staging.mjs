import assert from 'node:assert/strict';

const sha = process.argv[2];
assert.match(sha ?? '', /^[a-f0-9]{40}$/);
for (const app of ['talmud', 'tanach']) {
  const origin = `https://staging.${app}.dev`;
  const response = await fetch(`${origin}/api/release`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${app} release endpoint`);
  assert.deepEqual(await response.json(), { environment: 'staging', sha });
  const html = await (await fetch(origin)).text();
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(asset, `${app} entry script`);
  assert.equal((await fetch(new URL(asset, origin))).status, 200);
}
const source = await fetch('https://staging.talmud.dev/api/daf-view/Berakhot/2a?lang=en', {
  signal: AbortSignal.timeout(60000),
});
assert.equal(source.status, 200, 'Saved Berakhot 2a');
const saved = await source.text();
assert.ok(saved.includes('Berakhot') && saved.length > 1000, 'Saved study content is available');
const gallery = await fetch('https://staging.talmud.dev/components/');
assert.equal(gallery.status, 200, 'Component library');
console.log(`Both staging apps serve ${sha}`);
