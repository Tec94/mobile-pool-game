import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLES, P, simulate } from '../../src/physics/engine.ts';
import { ball, POCKET, PRESETS, shotOf } from '../src/presets.mjs';

test('the marked pocket is the corner the presets aim at', () => assert.ok(HOLES[POCKET][0] > P.L && HOLES[POCKET][1] < 0));
for (const p of PRESETS) test(`${p.name}: pots only the object ball, which the cue ball hits first`, () => {
  const r = simulate(p.balls.map(q => ball(...q)), shotOf(p));
  assert.equal(r.first, p.balls.length - 1);
  assert.deepEqual([...r.potted, ...r.off], [p.balls.length - 1]);
});
test('Jump and Massé need the raised cue: level, the cue ball hits the blocker', () => {
  for (const p of PRESETS.slice(1)) assert.equal(simulate(p.balls.map(q => ball(...q)), shotOf({ ...p, elev: 0 })).first, 1);
});
