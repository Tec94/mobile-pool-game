import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// The web demo (scripts/demo-web.mjs) swaps some game files for its own. A name the game imports from a swapped file
// but the swap does not export is undefined in the demo, which no build step sees.
const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const names = src => [...src.matchAll(/^export (?:const|let|function|class) (\w+)/gm)].map(m => m[1]).sort();
test('each demo swap exports every name of the file it replaces', () => {
  const swaps = [...read('demo/metro.config.js').matchAll(/'(src\/[^']+)': '(demo\/[^']+)'/g)];
  assert.ok(swaps.length >= 2);
  for (const [, real, swap] of swaps) {
    const file = ['.ts', '.tsx'].map(x => real + x).find(f => { try { return read(f); } catch { return false; } });
    assert.ok(file, `${real} is gone`);
    assert.deepEqual(names(read(swap)), names(read(file)), `${swap} vs ${file}`);
  }
});
