import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// The web demo (scripts/demo-web.mjs) swaps some files for its own. A name the game imports from a swapped file but
// the swap does not export is undefined in the demo, which no build step sees.
const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const names = src => [...src.matchAll(/^export (?:default |async )?(?:const|let|var|function\*?|class|enum) (\w+)|^export \{([^}]*)\}/gm)]
  .flatMap(m => m[1] ? [m[1]] : m[2].split(',').map(n => n.trim().split(/\s+as\s+/).pop()).filter(Boolean)).sort();
test('each demo swap of a game file exports the same names', () => {
  const swaps = [...read('demo/metro.config.js').matchAll(/'(src\/[^']+)': '(demo\/[^']+)'/g)];
  assert.ok(swaps.length >= 2);
  for (const [, real, swap] of swaps) {
    const file = ['.ts', '.tsx'].map(x => real + x).find(f => { try { return read(f); } catch { return false; } });
    assert.ok(file, `${real} is gone`);
    assert.deepEqual(names(read(swap)), names(read(file)), `${swap} vs ${file}`);
  }
});
test('the demo file system has every name the game imports from expo-file-system', () => {
  const have = names(read('demo/fs.js')), files = readdirSync(new URL('../../src', import.meta.url), { recursive: true }).filter(f => /\.tsx?$/.test(f));
  for (const f of files) for (const [, list] of read(`src/${f}`).matchAll(/import \{([^}]*)\} from 'expo-file-system'/g))
    for (const n of list.split(',').map(s => s.trim().replace(/^type\s+/, '')).filter(Boolean)) assert.ok(have.includes(n), `src/${f} imports ${n}`);
});
