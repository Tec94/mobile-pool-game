import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// The page bundles the game's own files. One of them moved once and the bundle stopped building, which no test saw.
test('every file the page script imports is there', () => {
  for (const f of ['app.js', 'presets.mjs', 'roadmap.mjs']) for (const [, path] of readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').matchAll(/from '(\.[^']+)'/g))
    assert.ok(existsSync(new URL(`../src/${path}`, import.meta.url)), `${f} imports ${path}`);
});
