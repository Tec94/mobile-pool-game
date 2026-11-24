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
test('the demo zooms a desktop window to a big phone and leaves a phone at 1', async () => {
  const { zoomOf } = await import('../../demo/zoom.ts');
  for (const [w, h] of [[852, 393], [932, 430], [390, 844], [375, 667]]) assert.equal(zoomOf(w, h), 1, `${w}x${h}`);
  assert.ok(Math.abs(zoomOf(1651, 990) - 1651 / 932) < 1e-9); // wide: the width decides
  assert.equal(zoomOf(1864, 1290), 2); // tall for its width: the height can't pass 430 pt
});
