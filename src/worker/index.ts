import { Hono } from 'hono';
import { sefariaAPI } from '../lib/sefref';

type Bindings = {
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/daf/:tractate/:page', async (c) => {
  const tractate = c.req.param('tractate');
  const page = c.req.param('page');
  const data = await sefariaAPI.getTalmudPageWithCommentaries(tractate, page);
  return c.json(data);
});

export default app;
