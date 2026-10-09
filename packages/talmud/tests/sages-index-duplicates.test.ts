import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerRabbiAdminRoutes } from '../src/worker/routes/rabbi-admin';
import type { Bindings } from '../src/worker/types';

const app = new Hono<{ Bindings: Bindings }>();
registerRabbiAdminRoutes(app);

describe('sages index retains reviewed people', () => {
  it('lists Shimon son of Abba under the retained ID and keeps his alternate names', async () => {
    const response = await app.request('/api/sages-index');
    expect(response.status).toBe(200);
    const { rows } = (await response.json()) as { rows: { slug: string; aliases: string[] }[] };
    const retained = rows.filter((r) => r.slug === 'rabbi-shimon-b-abba');
    expect(retained).toHaveLength(1);
    expect(retained[0].aliases).toContain('רבי שמעון בר אבא');
    expect(retained[0].aliases).toContain('Rabbi Shimon bar Abba');
    expect(rows.some((r) => r.slug === 'rabbi-shimon-bar-abba')).toBe(false);
    expect(rows.some((r) => r.slug === 'rabbi-oshaya')).toBe(true);
    expect(rows.some((r) => r.slug === 'rabbi-oshaya-2')).toBe(true);
  });
  it('keeps the same person in the maintenance list', async () => {
    const response = await app.request('/api/admin/rabbi-slugs');
    const { slugs } = (await response.json()) as { slugs: string[] };
    expect(slugs).toContain('rabbi-shimon-b-abba');
    expect(slugs).not.toContain('rabbi-shimon-bar-abba');
  });
});
