import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { rateLimit } from '../src/security/rateLimit.js';

test('rate limits use the session owner, reset after the window, and ignore forged forwarded IPs', async () => {
  const app = express();
  const limiter = rateLimit(1, 1000);
  app.get('/account/:owner', (req, res, next) => { res.locals.userId = req.params.owner; next(); }, limiter, (_req, res) => { res.sendStatus(204); });
  app.get('/ip', rateLimit(1, 60000), (_req, res) => { res.sendStatus(204); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    assert.equal((await fetch(base + '/account/a')).status, 204);
    const denied = await fetch(base + '/account/a');
    assert.equal(denied.status, 429); assert.equal(denied.headers.get('retry-after'), '1');
    assert.equal((await fetch(base + '/account/b')).status, 204);
    now += 1001;
    assert.equal((await fetch(base + '/account/a')).status, 204);
    assert.equal((await fetch(base + '/ip', { headers: { 'X-Forwarded-For': '1.2.3.4' } })).status, 204);
    assert.equal((await fetch(base + '/ip', { headers: { 'X-Forwarded-For': '5.6.7.8' } })).status, 429);
  } finally {
    Date.now = originalNow;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
