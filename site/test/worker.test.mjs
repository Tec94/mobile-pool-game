import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { join } from '../worker.js';

const rows = [];
let tries = 0;
const env = { LIMIT: { limit: async () => ({ success: ++tries <= 100 }) }, DB: { prepare: () => ({ bind: (...v) => ({ run: async () => { if (!rows.some(r => r[0] === v[0])) rows.push(v); } }) }) } };
const post = (body, type = 'application/json', more = {}) => join(new Request('https://x.test/api/join', { method: 'POST', headers: { 'content-type': type, ...more }, body }), env);

test('stores a signup once, in lower case, name optional', async () => {
  assert.equal((await post(JSON.stringify({ email: ' Jo@Example.com ', name: 'Jo', ref: 'ig' }))).status, 200);
  assert.equal((await post(JSON.stringify({ email: 'jo@example.com' }))).status, 200);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].slice(0, 3), ['jo@example.com', 'Jo', 'ig']);
});
test('refuses a bad email and a bad body', async () => {
  for (const b of ['{"email":"nope"}', '{"email":["a@b.co"]}', 'not json', 'null']) assert.equal((await post(b)).status, 400, b);
  assert.equal(rows.length, 1);
});
test('a filled honeypot is answered but not stored', async () => {
  assert.equal((await post(JSON.stringify({ email: 'bot@example.com', website: 'x' }))).status, 200);
  assert.equal(rows.length, 1);
});
test('a plain form post is stored and sent back to the page', async () => {
  const r = await post('email=a%40b.co&name=', 'application/x-www-form-urlencoded');
  assert.equal(r.status, 303); assert.match(r.headers.get('location'), /joined=1/);
  assert.equal(rows.length, 2); assert.equal(rows[1][1], null);
});
test('a post from another site is refused, one from the page is not', async () => {
  assert.equal((await post('{"email":"c@d.co"}', 'application/json', { origin: 'https://evil.test' })).status, 403);
  assert.equal((await post('{"email":"c@d.co"}', 'application/json', { origin: 'https://x.test' })).status, 200);
  assert.equal(rows.length, 3);
});
test('past the limit nothing is stored', async () => {
  tries = 100;
  assert.equal((await post('{"email":"e@f.co"}')).status, 429);
  assert.equal(rows.length, 3);
});
test('www and the old workers.dev address redirect to runout.win, keeping path and ref', async () => {
  const env2 = { ASSETS: { fetch: async () => new Response('page') } };
  for (const host of ['www.runout.win', 'runout-waitlist.jack-cao.workers.dev']) {
    const r = await worker.fetch(new Request(`https://${host}/?ref=ig`), env2);
    assert.equal(r.status, 301); assert.equal(r.headers.get('location'), 'https://runout.win/?ref=ig');
  }
  assert.equal(await (await worker.fetch(new Request('https://runout.win/?ref=ig'), env2)).text(), 'page');
  tries = 0;
  const old = await worker.fetch(new Request('https://runout-waitlist.jack-cao.workers.dev/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"g@h.co"}' }), env);
  assert.equal(old.status, 200);
});
test('serves the App Clip association file as JSON without a redirect', async () => {
  const r = await worker.fetch(new Request('https://runout.win/.well-known/apple-app-site-association'), env);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^application\/json/);
  assert.deepEqual((await r.json()).appclips.apps, ['T753GG3LAJ.com.tec94.pool.Clip']);
});
