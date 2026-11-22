import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLES, simulate } from '../../src/physics/engine.ts';
import { ball } from '../src/presets.mjs';
import { readFileSync } from 'node:fs';
import { BALLS, FILM, inView, NOW, PLAN, shotFor, STEPS, when } from '../src/roadmap.mjs';

test('the roadmap has a step and a shot for each of the nine balls', () => { assert.equal(STEPS.length, 9); assert.equal(PLAN.length, 9); assert.equal(BALLS.length, 10); assert.ok(NOW >= 0 && NOW <= 9); });
test('the run-out: every shot hits its own ball first and pots only it, in under 5 seconds', () => {
  let B = BALLS.map(q => ball(...q));
  for (let k = 0; k < 9; k++) {
    const r = simulate(B, shotFor(B, k));
    assert.equal(r.first, k + 1, `shot ${k + 1} hits its ball first`);
    assert.deepEqual([...r.potted, ...r.off], [k + 1], `shot ${k + 1} pots only its ball`);
    assert.ok(r.settled && r.steps < 5000, `shot ${k + 1} is over in time`);
    const [hx, hy] = HOLES[PLAN[k][0]]; assert.ok(Math.hypot(r.balls[k + 1].x - hx, r.balls[k + 1].y - hy) < 0.2, `shot ${k + 1} drops in the pocket the page rings`);
    // room to spare: a tune of the physics, or another browser's arithmetic, must not turn a pot into a miss
    for (const [d, f] of [[-0.3, 1], [-0.1, 1], [0.1, 1], [0.3, 1], [0, 0.97], [0, 1.03]]) { const shot = shotFor(B, k), q = simulate(B, { ...shot, ang: shot.ang + d * Math.PI / 180, speed: shot.speed * f }); assert.deepEqual([...q.potted, ...q.off], [k + 1], `shot ${k + 1} pots ${d} degrees off at ${f} of its speed`); }
    if (k >= 2 && k <= 6) { // the shots a visitor can see the cue on: it must not lie over a ball (the page draws the balls larger than life)
      const shot = shotFor(B, k), ux = -Math.cos(shot.ang), uy = -Math.sin(shot.ang);
      B.forEach((b, i) => { if (!i || !b.on) return; const t = Math.max(0, Math.min(0.8, (b.x - B[0].x) * ux + (b.y - B[0].y) * uy)); assert.ok(t < 0.03 || Math.hypot(B[0].x + ux * t - b.x, B[0].y + uy * t - b.y) >= 0.1, `on shot ${k + 1} the cue is clear of the ${i}`); });
    }
    B = r.balls;
  }
});
test('the tags: done before NOW, then the step in hand, the next, the rest', () => { assert.deepEqual([NOW - 1, NOW + 1, NOW + 2].map(when), ['Done', 'Next', 'Later']); assert.ok(FILM <= NOW); });
test('the chip by the name says the step in hand', () => { assert.ok(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').includes(`>In ${STEPS[NOW]}<`), 'NOW moved: change the chip, the footer and og.png'); });
test('the film starts when the table and the row in hand are in view, or the whole table on a short screen', () => {
  assert.ok(inView(100, 300, 700, 46, 844), 'both in view');
  assert.ok(inView(100, 300, 848, 46, 844), 'the row a tenth under the fold');
  assert.ok(!inView(100, 300, 900, 46, 844), 'the row below the fold');
  assert.ok(!inView(-50, 200, 600, 46, 844), 'the table above the screen');
  assert.ok(inView(10, 380, 900, 46, 390), 'a short screen: the whole table');
  assert.ok(!inView(10, 420, 900, 46, 390), 'a short screen: the table cut');
});
