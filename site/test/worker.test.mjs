import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from '../worker.js';

const rows = [];
const env = { DB: { prepare: () => ({ bind: (...v) => ({ run: async () => { if (!rows.some(r => r[0] === v[0])) rows.push(v); } }) }) } };
const post = (body, type = 'application/json') => join(new Request('https://x.test/api/join', { method: 'POST', headers: { 'content-type': type }, body }), env);

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
