// Run: npm test. AI styles (src/ai/styles.ts): what each one changes in a tier. Whether they hold up in play is
// npm run bench:styles.
import assert from 'node:assert';
import test from 'node:test';
import { aiParams } from './shot-ai.ts';
import { STYLE_BUMP, STYLE_IDS, STYLE_RANGE, styled } from './styles.ts';

test('every style changes the tier (the Closer near the end of a rack), keeps its rating bump small, and no style is no change', () => {
  const t = aiParams(4, () => 0.5);
  assert.equal(styled(t), t);
  for (const k of STYLE_IDS) { assert.notDeepStrictEqual(styled(t, k, 2), t, k); assert(STYLE_BUMP[k] >= 0 && STYLE_BUMP[k] <= 0.3); assert(STYLE_RANGE[k][0] < STYLE_RANGE[k][1]); }
});
test('the Closer is sharper only with two balls or fewer to win the rack', () => {
  const t = aiParams(4, () => 0.5);
  assert.equal(styled(t, 'closer', 3).sigma, t.sigma); assert(styled(t, 'closer', 2).sigma < t.sigma / 2); assert.deepStrictEqual(styled(t, 'closer', 2).safetyAngles, []);
});
test('the Banker plays banks and kicks, the Wall plays safe sooner, the Gunslinger never does', () => {
  const t = aiParams(2, () => 0.5);
  assert(styled(t, 'banker').types.includes('bank') && styled(t, 'banker').types.includes('kick'));
  assert(styled(t, 'wall').safeAt > (t.safeAt ?? 0.3)); assert.deepStrictEqual(styled(t, 'gun').safetyAngles, []);
});
