import assert from 'node:assert/strict';

const sha = process.argv[2];
assert.match(sha ?? '', /^[a-f0-9]{40}$/);

/** A new custom domain can take a minute or two to get its certificate, so the
 *  first check after a deploy retries until the new commit answers. */
async function waitForRelease(origin) {
  let last = 'no response';
  for (let attempt = 0; attempt < 24; attempt++) {
    try {
      const response = await fetch(`${origin}/api/release`, { signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const body = await response.json();
        if (body.environment === 'staging' && body.sha === sha) return;
        last = JSON.stringify(body);
      } else last = `HTTP ${response.status}`;
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  assert.fail(`${origin} never served ${sha}: ${last}`);
}

for (const app of ['talmud', 'tanach']) {
  const origin = `https://staging.${app}.dev`;
  await waitForRelease(origin);
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
