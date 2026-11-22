import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../../src/physics/engine.ts';
import { ball } from '../src/presets.mjs';
import { BALLS, NOW, PLAN, shotFor, STEPS } from '../src/roadmap.mjs';

test('the roadmap has a step and a shot for each of the nine balls', () => { assert.equal(STEPS.length, 9); assert.equal(PLAN.length, 9); assert.equal(BALLS.length, 10); assert.ok(NOW >= 0 && NOW <= 9); });
test('the run-out: every shot hits its own ball first and pots only it, in under 5 seconds', () => {
  let B = BALLS.map(q => ball(...q));
  for (let k = 0; k < 9; k++) {
    const r = simulate(B, shotFor(B, k));
    assert.equal(r.first, k + 1, `shot ${k + 1} hits its ball first`);
    assert.deepEqual([...r.potted, ...r.off], [k + 1], `shot ${k + 1} pots only its ball`);
    assert.ok(r.settled && r.steps < 5000, `shot ${k + 1} is over in time`);
    // room to spare: a tune of the physics, or another browser's arithmetic, must not turn a pot into a miss
    for (const d of [-0.3, -0.1, 0.1, 0.3]) { const shot = shotFor(B, k), q = simulate(B, { ...shot, ang: shot.ang + d * Math.PI / 180 }); assert.deepEqual([...q.potted, ...q.off], [k + 1], `shot ${k + 1} pots ${d} degrees off`); }
    B = r.balls;
  }
});
