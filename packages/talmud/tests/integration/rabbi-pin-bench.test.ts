import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeRabbiPin } from '../../src/worker/index';
import bench from '../fixtures/rabbi-pin-bench.json';

/**
 * Accuracy benchmark for the EXPERIMENTAL rabbi.identity.pin disambiguator.
 *
 * Runs the REAL computeRabbiPin (one OpenRouter call per case) over the 14
 * ambiguous Berakhot 2a-11b mentions (tests/fixtures/rabbi-pin-bench.json) and
 * scores it against hand-labeled ground truth. This is the eval gate referenced
 * in the framework ("benchmark before promoting a producer to the prod
 * default") — the pin currently overrides the deterministic honest-grounding
 * only in dev-mode, so this run is what justifies flipping it on.
 *
 * NOT a CI test: it needs live LLM creds + costs money, so it is gated on
 * RUN_PIN_BENCH=1 and lives under tests/integration (excluded from `pnpm test`).
 * Run it from the worktree with:
 *   RUN_PIN_BENCH=1 pnpm --filter talmud test:int rabbi-pin-bench
 * Creds are read from packages/talmud/.dev.vars (OPENROUTER_API_KEY +
 * CLOUDFLARE_ACCOUNT_ID); AI_GATEWAY_ID is the wrangler.toml value 'talmud'.
 *
 * NOTE: this harness has NO warmed cache, so computeRabbiPin's daf-cast read
 * returns empty — the pin reasons from candidate generations/edges + the stam
 * conventions only. Production additionally feeds the daf's co-rabbi cast, so
 * these numbers are a conservative floor.
 */

type Case = {
  daf: string;
  name: string;
  nameHe: string;
  generation: string;
  category: 'clear' | 'hard' | 'decline';
  accept: string[];
  note: string;
};
const CASES = (bench as { cases: Case[] }).cases;

// .dev.vars is KEY=VALUE per line. Fall back to process.env.
function loadDevVars(): Record<string, string> {
  const out: Record<string, string> = { ...(process.env as Record<string, string>) };
  const p = fileURLToPath(new URL('../../.dev.vars', import.meta.url));
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

describe.skipIf(!process.env.RUN_PIN_BENCH)('rabbi.identity.pin accuracy benchmark', () => {
  const vars = loadDevVars();
  // biome-ignore lint/suspicious/noExplicitAny: minimal LLMEnv for a standalone runLLM call (no KV/AI bindings needed).
  const env: any = {
    OPENROUTER_API_KEY: vars.OPENROUTER_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: vars.CLOUDFLARE_ACCOUNT_ID,
    AI_GATEWAY_ID: vars.AI_GATEWAY_ID ?? 'talmud',
    OPENROUTER_GATEWAY_PROVIDER: vars.OPENROUTER_GATEWAY_PROVIDER ?? 'openrouter',
  };

  it('pins the clear cases, declines when undecidable, never confidently wrong', async () => {
    expect(env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY (.dev.vars)').toBeTruthy();

    const lines: string[] = [];
    let clearTotal = 0;
    let clearHit = 0;
    let declineTotal = 0;
    let declineOk = 0;
    let confidentlyWrong = 0; // pinned a WRONG slug (pin only emits high/medium)

    for (const c of CASES) {
      const pin = await computeRabbiPin(env, 'Berakhot', c.daf, {
        name: c.name,
        nameHe: c.nameHe,
        // biome-ignore lint/suspicious/noExplicitAny: GenerationId is a string union; the fixture carries the model's tag.
        generation: c.generation as any,
        homonyms: null,
      });
      const pinned = pin.genSource === 'ai-pin' && !!pin.slug;
      const slug = pin.slug ?? null;
      const hit = pinned && c.accept.includes(slug as string);
      const wrong = pinned && c.accept.length > 0 && !c.accept.includes(slug as string);
      const wrongOnDecline = pinned && c.category === 'decline';

      if (c.category === 'clear') {
        clearTotal++;
        if (hit) clearHit++;
        if (wrong) confidentlyWrong++;
      } else if (c.category === 'decline') {
        declineTotal++;
        if (!pinned) declineOk++;
        if (wrongOnDecline) confidentlyWrong++;
      }

      const verdict = pinned ? `PIN ${slug} (${pin.confidence})` : 'declined';
      const mark =
        c.category === 'hard'
          ? hit
            ? 'hard✓'
            : 'hard·'
          : c.category === 'decline'
            ? pinned
              ? 'DECLINE✗'
              : 'decline✓'
            : hit
              ? 'clear✓'
              : 'clear✗';
      lines.push(
        `[${mark}] ${c.daf} ${c.name} (${c.nameHe}) → ${verdict}${pin.reason ? ` — ${pin.reason}` : ''}`,
      );
    }

    const clearAcc = clearTotal ? clearHit / clearTotal : 1;
    const report = [
      `=== rabbi.identity.pin benchmark (Berakhot 2a-11b, ${CASES.length} ambiguous mentions; no-cast floor) ===`,
      `clear accuracy:   ${clearHit}/${clearTotal} (${(clearAcc * 100).toFixed(0)}%)`,
      `declines correct: ${declineOk}/${declineTotal}`,
      `CONFIDENTLY WRONG: ${confidentlyWrong}  (pinned a wrong identity — the metric that must stay ~0)`,
      '',
      ...lines,
    ].join('\n');
    console.log(`\n${report}\n`);
    if (process.env.PIN_BENCH_OUT) writeFileSync(process.env.PIN_BENCH_OUT, report);

    // Floors (soft — this is a manual eval, not CI). The safety metric is the
    // hard one: a confident-wrong pin is exactly the failure mode "pin harder"
    // accepted risk on, so it must stay near zero.
    expect(confidentlyWrong, report).toBeLessThanOrEqual(1);
    expect(clearAcc, report).toBeGreaterThanOrEqual(0.6);
    expect(declineOk, report).toBeGreaterThanOrEqual(Math.ceil(declineTotal / 2));
  });
});
