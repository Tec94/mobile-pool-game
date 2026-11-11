// Run: npm test   (checks the shot controls: what a touch does to the aim and the power, and what the guide shows)
import assert from 'node:assert';
import { CUE, P, predict } from '../physics/engine.ts';
import { shotLayout } from '../render/cue.ts';
import { RAIL } from '../render/table.ts';
import { aimGuide, dialTurn, guideFor, nearest, nudge, powerTick, previewPower, pullPower, railLabel, release, SENS, swing, tapAim } from './aim.ts';
const mk = (x, y, on = true) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on });
const near = (a, b, tol, msg) => assert(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b}`);
const len = p => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
const DEG = Math.PI / 180, mid = P.W / 2;
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

{ // A drag on the table turns the aim by the turn of the finger about the cue ball, and by less near the ball.
  near(swing(1, 0, 0.1, 100), 1.1, 1e-12, 'far from the cue ball the aim follows the finger');
  near(swing(1, 0, 0.1, 10), 1.025, 1e-12, '10 px from the ball is a quarter of the turn');
  near(swing(1, 3.1, -3.1, 100), 1 + 2 * Math.PI - 6.2, 1e-12, 'across the cut at 180 degrees the short way');
  ok('a drag swings the aim, scaled down inside 40 px of the cue ball');
}
{ // A tap points the cue, but not once the fine dial was used for this shot.
  assert(tapAim(1, false, 2) === 2 && tapAim(1, true, 2) === 1, 'tap');
  ok('a tap aims until the fine dial was used');
}
{ // The dial: 0.0012 rad per px, clockwise on the glass for a drag to the right or down.
  near(dialTurn(0, 100).aim, -0.12, 1e-12, 'normal'); near(dialTurn(0, 100, SENS.Fast).aim, -0.24, 1e-12, 'fast'); near(dialTurn(0, 100, SENS.Slow).aim, -0.06, 1e-12, 'slow');
  assert(!dialTurn(0.001, -5).tick, '0.001 to 0.007 rad stays inside one half degree');
  assert(dialTurn(0.001, -10).tick && dialTurn(0.001, 10).tick, 'a tick on each half degree line, both ways');
  near(nudge(0, 1), -0.1 * DEG, 1e-12, 'right or lower half'); near(nudge(0, -1), 0.1 * DEG, 1e-12, 'left or upper half');
  ok('the dial turns 0.0012 rad per px with a tick each half degree, a tap nudges 0.1 degree');
}
{ // The rail: full power over 75% of its height, from the power it had when the finger went down.
  near(pullPower(150, 400), 0.5, 1e-12, 'half'); assert(pullPower(400, 400) === 1 && pullPower(-20, 400) === 0, 'held in 0..1');
  near(pullPower(30, 400, 0.3), 0.4, 1e-12, 'a pull goes on from the set power');
  assert(powerTick(0.08, 0.12) === 1 && powerTick(0.12, 0.18) === 0 && powerTick(0.12, 0.08) === 1, 'a tick at each 10% line');
  assert(powerTick(0.95, 1) === 2 && powerTick(0.12, 0.04) === 0, 'heavy at full, none under 5%');
  assert(['Pull', '50%', 'Cancel', '30%'].join() === [railLabel(0, false), railLabel(0.5, true), railLabel(0.03, true), railLabel(0.3, false)].join(), 'label');
  ok('a pull sets the power with a tick each 10%');
}
{ // Release: a finger that had settled wobbles as it lifts, so the power from 80 ms before counts.
  near(release([[0, 0.6], [100, 0.6], [170, 0.58], [190, 0.57]], 200, 0.57), 0.6, 1e-12, 'settled finger');
  near(release([[0, 0.2], [100, 0.5], [190, 0.7]], 200, 0.7), 0.7, 1e-12, 'a pull that still moves is taken as it is');
  near(release([], 200, 0.5), 0.5, 1e-12, 'no history');
  assert(release([[0, 0.03]], 200, 0.03) === 0 && release([[0, 0.04], [190, 0.06]], 200, 0.06) === 0 && release([[0, 0.07]], 200, 0.04) === 0, 'under 5% cancels, also when it only wobbled across the line');
  ok('release strikes above 5% with the settled power');
}
{ // What the guide previews, and how long it is.
  assert(previewPower(0.03) === 0.7 && previewPower(0.4) === 0.4, 'preview power');
  assert([1, 2, 3, 5, 6, 7, 10].map(guideFor).join() === '1,1,2,2,2,3,3', 'Aim stat to guide level');
  near(nearest([mk(0.5, 0.5), mk(1, 0.5, false), mk(0.5, 1.2), mk(2, 0.5)]), Math.PI / 2, 1e-12, 'nearest ball on the table');
  assert(nearest([mk(0.5, 0.5)], 1.5) === 1.5, 'no ball: the aim stays');
  const B = [mk(0.5, mid), mk(1, mid + 0.03)], shot = { ang: 0, speed: 2, a: 0, b: 0 };
  const m = aimGuide(B, shot, 2), end = m.path[m.path.length - 1];
  near(Math.hypot(end[0] - 1, end[1] - mid - 0.03), 2 * P.R, 2e-3, 'Medium: the cue line stops at the first contact');
  near(Math.hypot(m.ghost[0] - end[0], m.ghost[1] - end[1]), 0, 1e-3, 'ghost at the contact');
  near(len(m.ob), 0.25, 1e-9, 'Medium: 0.25 m of object ball path'); near(m.ob[0][0], 1, 2e-3, 'from the object ball');
  near(len(aimGuide(B, shot, 1).ob), 0.1, 1e-9, 'Short: 0.1 m');
  const l = aimGuide(B, shot, 3); near(len(l.path) - len(m.path), 0.6, 1e-9, 'Long: 0.6 m of cue ball path after the contact'); near(len(l.ob), 0.6, 1e-9, 'and of the object ball');
  assert(aimGuide(B, shot, 0).ob.length < 2, 'Off: no object ball path');
  const jump = aimGuide([mk(0.3, mid)], { ang: Math.PI, speed: 4.5, a: 0, b: 0, elev: 42 * DEG }, 2); assert(jump.lost && !jump.ghost, 'a jump off the table is lost');
  ok('the guide shows the object ball path, and the cue ball path after contact only at Long');
}
{ // A kick shot at Medium: the line stops at the cushion, the ring sits on its end and no object ball path hangs loose.
  const ball = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }), B = [ball(1, 0.3), ball(1.4, 0.12)];
  const g = aimGuide(B, { ang: Math.atan2(-0.27, 0.3), speed: 2, a: 0, b: 0 }, 2), end = g.path[g.path.length - 1];
  assert(end[1] < P.R + 1e-3, 'the line ends at the cushion'); assert(g.ghost && Math.hypot(g.ghost[0] - end[0], g.ghost[1] - end[1]) < 1e-9, 'the ring is on the end of the line'); assert(g.ob.length === 0, 'no object ball path');
  ok('a kick shot shows the ring at the cushion');
}
{ // The guide uses the cue that strikes: with side spin a cue of no squirt meets the ball elsewhere than the default cue.
  const B = [mk(0.5, mid), mk(1.5, mid)], shot = { ang: 0, speed: 2, a: 0.3, b: 0 }, hex = { ...CUE, squirt: 0 };
  const plain = aimGuide(B, shot, 2).ghost, g = aimGuide(B, shot, 2, undefined, hex).ghost, h = predict(B, shot, 0.25, hex).hit;
  near(Math.hypot(g[0] - h.x, g[1] - h.y), 0, 1e-12, 'the ghost is where that cue meets the ball');
  assert(Math.abs(g[1] - plain[1]) > 1e-3, 'and not where the default cue does');
  ok('the guide takes the engine cue');
}
{ // The layout: on an iPhone and a small Android window, both ways up, every control is a 44 pt target inside the safe
  // area, and no control touches another or the table.
  for (const [w, h, pad] of [[393, 852, { top: 59, right: 0, bottom: 34, left: 0 }], [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }], [360, 640, { top: 24, right: 0, bottom: 0, left: 0 }], [640, 360, { top: 0, right: 0, bottom: 0, left: 24 }]]) {
    const { view: v, ...ui } = shotLayout(w, h, pad), land = w > h, tw = (land ? P.L : P.W) + 2 * RAIL, th = (land ? P.W : P.L) + 2 * RAIL;
    const boxes = [...Object.entries(ui), ['table', { left: v.ox - RAIL * v.s, top: v.oy - RAIL * v.s, width: tw * v.s, height: th * v.s }]];
    for (const [name, b] of boxes) {
      assert(b.width >= 44 && b.height >= 44, `${name} is a 44 pt target at ${w}x${h}`);
      assert(b.left >= pad.left && b.top >= pad.top && b.left + b.width <= w - pad.right + 1e-9 && b.top + b.height <= h - pad.bottom + 1e-9, `${name} is inside the safe area at ${w}x${h}`);
      for (const [other, o] of boxes) assert(name === other || b.left + b.width <= o.left + 1e-9 || o.left + o.width <= b.left + 1e-9 || b.top + b.height <= o.top + 1e-9 || o.top + o.height <= b.top + 1e-9, `${name} and ${other} overlap at ${w}x${h}`);
    }
    assert(v.land === land && ui.rail.left > v.ox + (tw - RAIL) * v.s, 'the rail is right of the table');
  }
  ok('the controls and the table fit the window without overlap');
}
