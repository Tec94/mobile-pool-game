// Run: npm test   (checks that the drawn ball follows the engine: orientation from spin, effects from events)
import assert from 'node:assert';
import { P, strike } from '../physics/engine.ts';
import { advance, newLook, turn } from './balls.ts';
import { BAR, fit, RAIL, toScreen, toTable } from './table.ts';
const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
const near = (a, b, tol, msg) => assert(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b}`);
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

{ // A ball that rolls towards +x carries its top point forward, and one full turn brings it back.
  const m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  turn(m, 0, 10, 0, Math.PI / 20); // a quarter turn about +y, the spin of a ball rolling along +x
  near(m[2], 1, 1e-12, 'top point moves to +x'); near(m[8], 0, 1e-12, 'top point leaves the top');
  for (let i = 0; i < 3000; i++) turn(m, 0, 10, 0, Math.PI / 20 / 1000);
  [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => near(m[i], v, 1e-9, 'full turn, cell ' + i));
  ok('turn follows the right-hand rule and stays a rotation');
}
{ // Rolling without slip: the pattern turns one radian for each ball radius travelled.
  const B = [mk(0.5, 0.5)], look = newLook(B); strike(B[0], { ang: 0, speed: 0.4, a: 0, b: 0.4 });
  let run = true, ms = 0; while (run) { run = advance(B, look, 16, run); ms += 16; }
  const turns = (B[0].x - 0.5) / P.R, m = look.m[0];
  near(Math.atan2(m[2], m[8]), Math.atan2(Math.sin(turns), Math.cos(turns)), 0.02, 'angle turned matches distance rolled');
  near(m[4], 1, 1e-9, 'no turn about the roll axis');
  ok('a rolling ball turns with the distance it travels');
}
{ // Side spin alone turns the ball about the vertical and nothing else.
  const B = [mk(0.5, 0.5)], look = newLook(B); B[0].wz = 20; B[0].vx = 0.5; B[0].wy = 0.5 / P.R;
  advance(B, look, 50, true);
  assert(Math.abs(look.m[0][1]) > 0.1, 'pattern turned about the vertical');
  ok('side spin turns the pattern in the plane of the table');
}
{ // A potted ball starts a drop effect that keeps the speed it arrived with, and the effect ends.
  const B = [mk(0.1, 0.1)], look = newLook(B); strike(B[0], { ang: -3 * Math.PI / 4, speed: 1, a: 0, b: 0 });
  let run = true; while (run) run = advance(B, look, 16, run);
  assert(!B[0].on, 'ball potted'); assert.equal(look.fx.length, 1); assert.equal(look.fx[0].t, 'pocket');
  assert(Math.hypot(look.fx[0].vx, look.fx[0].vy) > 0.3, 'arrival speed kept');
  for (let i = 0; i < 20; i++) advance(B, look, 16, false);
  assert.equal(look.fx.length, 0, 'effect ended');
  ok('pocket drop starts from the ball state before the pot and ends');
}
{ // A jump leaves a landing ring only for the hard touchdown, and a ball that flies over the rail gets a flight effect.
  const B = [mk(0.5, 0.55)], look = newLook(B); strike(B[0], { ang: 0, speed: 4.2, a: 0, b: 0, elev: 40 * Math.PI / 180 });
  let run = true, lands = 0, seen = new Set(); for (let f = 0; f < 40 && run; f++) { run = advance(B, look, 16, run); for (const e of look.fx) if (!seen.has(e)) { seen.add(e); lands++; } }
  assert(lands >= 1 && lands <= 3, 'landing rings: ' + lands);
  const C = [mk(0.3, 0.55)], l2 = newLook(C); strike(C[0], { ang: Math.PI, speed: 4.5, a: 0, b: 0, elev: 42 * Math.PI / 180 });
  run = true; let off = null; while (run) { run = advance(C, l2, 16, run); off = off || l2.fx.find(e => e.t === 'off'); }
  assert(off && off.z > P.railH && off.vx < -1, 'off-table effect keeps height and speed');
  ok('landing and off-table effects follow the engine events');
}
{ // The table, frame included, stays off the glass, out of the safe area insets and clear of the controls, and a touch maps back.
  for (const [w, h, pad] of [[852, 393, { top: 0, right: 59, bottom: 21, left: 59 }], [393, 852, { top: 59, right: 0, bottom: 34, left: 0 }], [667, 375, { top: 0, right: 0, bottom: 0, left: 0 }]]) {
    const v = fit(w, h, pad), a = toScreen(v, -RAIL, -RAIL), b = toScreen(v, P.L + RAIL, P.W + RAIL), e = 1e-9;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    assert(x0 >= Math.max(pad.left, 8) - e && y0 >= Math.max(pad.top, 8) - e, `table starts inside the window ${w}x${h}`);
    assert(x1 <= w - Math.max(pad.right, 8) - (v.land ? BAR : 0) + e && y1 <= h - Math.max(pad.bottom, 8) - (v.land ? 0 : BAR) + e, `table ends before the controls ${w}x${h}`);
    const p = toScreen(v, 0.7, 0.3), q = toTable(v, p.x, p.y); near(q.x, 0.7, 1e-9, 'x maps back'); near(q.y, 0.3, 1e-9, 'y maps back');
  }
  ok('the table fits inside the safe area beside the controls in both orientations');
}
console.log(`\n${n} checks passed`);
