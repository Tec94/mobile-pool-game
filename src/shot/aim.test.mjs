// Run: npm test   (checks the shot controls: what a touch does to the aim and the power, and what the guide shows)
import assert from 'node:assert';
import { CUE, P, predict } from '../physics/engine.ts';
import { DIAL, shotLayout } from '../render/cue.ts';
import { RAIL } from '../render/table.ts';
import { aimGuide, dialTurn, guideLen, nearest, nudge, powerTick, previewPower, pullPower, railLabel, release, SENS, swing, tapAim } from './aim.ts';
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
  near(pullPower(150, 300), 0.5, 1e-12, 'half'); assert(pullPower(400, 300) === 1 && pullPower(-20, 300) === 0, 'held in 0..1');
  near(pullPower(30, 300, 0.3), 0.4, 1e-12, 'a pull goes on from the set power');
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
  const lens = [0, 1, 2, 5, 6, 7, 10, 12].map(a => Math.round(guideLen(a) * 1000)); assert(lens.join() === '0,100,156,322,378,433,600,600', `Aim stat to guide length: ${lens}`);
  for (let a = 1; a < 10; a++) assert(guideLen(a + 1) > guideLen(a), `Aim ${a + 1} shows more than Aim ${a}`);
  near(nearest([mk(0.5, 0.5), mk(1, 0.5, false), mk(0.5, 1.2), mk(2, 0.5)]), Math.PI / 2, 1e-12, 'nearest ball on the table');
  assert(nearest([mk(0.5, 0.5)], 1.5) === 1.5, 'no ball: the aim stays');
  const B = [mk(0.5, mid), mk(1, mid + 0.03)], shot = { ang: 0, speed: 2, a: 0, b: 0 };
  const m = aimGuide(B, shot, 5), end = m.path[m.path.length - 1];
  near(Math.hypot(end[0] - 1, end[1] - mid - 0.03), 2 * P.R, 2e-3, 'Aim 5: the cue line stops at the first contact');
  near(Math.hypot(m.ghost[0] - end[0], m.ghost[1] - end[1]), 0, 1e-3, 'ghost at the contact');
  near(len(m.ob), guideLen(5), 1e-9, 'Aim 5: 0.32 m of object ball path'); near(m.ob[0][0], 1, 2e-3, 'from the object ball');
  near(len(aimGuide(B, shot, 1).ob), 0.1, 1e-9, 'Aim 1: 0.1 m'); near(len(aimGuide(B, shot, 6).ob) - len(m.ob), 0.5 / 9, 1e-9, 'one Aim point: 5.6 cm more');
  const l = aimGuide(B, shot, 10); near(len(l.ob), 0.6, 1e-9, 'Aim 10: 0.6 m of object ball path');
  near(len(aimGuide(B, shot, 10, undefined, undefined, true).path) - len(m.path), 0.6, 1e-9, 'the watch stage of a lesson: 0.6 m of the real cue ball path after the contact');
  assert(aimGuide(B, shot, 0).ob.length < 2, 'Off: no object ball path');
  const jump = aimGuide([mk(0.3, mid)], { ang: Math.PI, speed: 4.5, a: 0, b: 0, elev: 42 * DEG }, 5); assert(jump.lost && !jump.ghost, 'a jump off the table is lost');
  ok('the guide grows with every Aim point');
}
{ // After the contact the guide gives away only the tangent line: a short straight stub from the ghost ball, from Aim 7.
  const B = [mk(0.5, mid), mk(1.2, mid + 0.03)], plain = { ...CUE, squirt: 0, minElev: 0 }; // no squirt or swerve: side spin leaves the contact where it was
  const g = (s, aim = 10) => aimGuide(B, { ang: 0, a: 0, b: 0, speed: 2, ...s }, aim, undefined, plain), dir = q => { const [a, b] = q.stub, d = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
  const base = g({}); assert.strictEqual(base.stub.length, 2, 'Aim 10: a stub of one straight line');
  const [ux, uy] = dir(base), ox = 1.2 - base.ghost[0], oy = mid + 0.03 - base.ghost[1];
  near(Math.hypot(base.stub[0][0] - base.ghost[0], base.stub[0][1] - base.ghost[1]), 0, 1e-12, 'from the ghost ball');
  near(len(base.stub), 4 * P.R, 1e-12, 'four ball radii long');
  near((ux * ox + uy * oy) / Math.hypot(ox, oy), 0, 0.03, 'along the tangent line, square to the line of centres'); assert(ux > 0 && uy < 0, 'forward, away from the object ball');
  const end = base.path[base.path.length - 1]; near(Math.hypot(end[0] - base.ghost[0], end[1] - base.ghost[1]), 0, 1e-9, 'the cue ball line stops at the ghost ball');
  for (const [name, s] of [['top', { b: 0.5 }], ['bottom', { b: -0.5 }], ['right side', { a: 0.5 }], ['left side', { a: -0.5 }], ['soft', { speed: 0.6 }], ['hard', { speed: 4.5 }], ['draw, hard', { b: -0.5, speed: 4 }]]) {
    const q = g(s), [vx, vy] = dir(q);
    near(Math.hypot(vx - ux, vy - uy), 0, 1e-6, `${name}: the same direction`); near(len(q.stub), 4 * P.R, 1e-12, `${name}: the same length`);
    const far = Math.max(...q.path.map(p => p[0] - q.ghost[0])); // the aim is along x
    assert(far <= 1e-9, `${name}: no point of the path beyond the ghost (${far})`);
  }
  for (const aim of [1, 5, 6]) { const q = g({}, aim), e = q.path[q.path.length - 1]; assert(q.stub.length === 0 && Math.hypot(e[0] - q.ghost[0], e[1] - q.ghost[1]) < 1e-9, `Aim ${aim}: nothing after the contact`); }
  assert.strictEqual(g({}, 7).stub.length, 2, 'Aim 7: the stub');
  const full = aimGuide([mk(0.5, mid), mk(1.2, mid + 0.001)], { ang: 0, speed: 2, a: 0, b: 0.5 }, 10, undefined, plain); // a 1 degree cut
  assert(full.ghost && full.stub.length === 0, 'a full-ball hit: no stub'); assert(Math.max(...full.path.map(p => p[0])) <= full.ghost[0] + 1e-9, 'and no follow line past the ghost');
  // The stub grows with the cut, from nothing on a full hit to its whole length at a 30 degree cut: no pop as it shows.
  const cut = deg => len(aimGuide([mk(0.5, mid), mk(1.2, mid + 2 * P.R * Math.sin(deg * DEG))], { ang: 0, speed: 2, a: 0, b: 0 }, 10, undefined, plain).stub);
  const lens = [4, 10, 20, 30, 45].map(cut);
  assert(lens[0] < 0.2 * 4 * P.R, `a 4 degree cut: a short stub (${lens[0]})`); assert(lens.every((l, i) => !i || l >= lens[i - 1] - 1e-12), `longer with the cut: ${lens}`);
  near(lens[3], 4 * P.R, 2e-3, 'whole from 30 degrees'); near(lens[4], 4 * P.R, 1e-12, 'whole at 45 degrees');
  // A jump: the cue ball meets the ball in the air, or bounces down to it, and leaves with its hop: no tangent stub.
  const air = aimGuide([mk(0.5, mid), mk(0.9, mid - 0.015)], { ang: 0, speed: 4.2, a: 0, b: 0, elev: 25 * DEG }, 10), landed = aimGuide([mk(0.6, mid), mk(0.85, mid), mk(1.6, mid - 0.03)], { ang: 0, speed: 3.2, a: 0, b: 0, elev: 40 * DEG }, 10);
  assert(air.ghost && air.stub.length === 0, 'a contact in the air: no stub'); assert(landed.first === 2 && landed.lands.length && landed.stub.length === 0, 'a contact after a jump: no stub');
  // Near a rail the stub stops where the cue ball meets the cushion nose.
  for (const [c, o, ang] of [[[0.6, P.W - 0.08], [1.2, P.W - 0.12], 0], [[P.L - 0.08, 0.3], [P.L - 0.12, 0.9], Math.PI / 2]]) { // by a side rail, by the foot rail
    const rail = aimGuide([mk(...c), mk(...o)], { ang, speed: 2, a: 0, b: 0 }, 10, undefined, plain).stub;
    assert(rail.length === 2 && len(rail) > 0.01 && len(rail) < 4 * P.R - 0.01, `a short stub by the rail (${len(rail)})`);
    for (const [x, y] of rail) assert(x >= P.R - 1e-9 && x <= P.L - P.R + 1e-9 && y >= P.R - 1e-9 && y <= P.W - P.R + 1e-9, `the stub stays off the cushion (${x}, ${y})`);
  }
  ok('after the contact a straight 4-radius stub on the tangent line, the same for every spin and power, from Aim 7');
}
{ // A kick shot below Aim 7: the line stops at the cushion, the ring sits on its end and no object ball path hangs loose.
  const ball = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true }), B = [ball(1, 0.3), ball(1.4, 0.12)];
  const g = aimGuide(B, { ang: Math.atan2(-0.27, 0.3), speed: 2, a: 0, b: 0 }, 5), end = g.path[g.path.length - 1];
  assert(end[1] < P.R + 1e-3, 'the line ends at the cushion'); assert(g.ghost && Math.hypot(g.ghost[0] - end[0], g.ghost[1] - end[1]) < 1e-9, 'the ring is on the end of the line'); assert(g.ob.length === 0, 'no object ball path');
  const f = aimGuide(B, { ang: Math.atan2(-0.27, 0.3) + 0.02, speed: 2, a: 0, b: 0 }, 10), last = f.path[f.path.length - 1];
  assert(f.first === 1 && Math.hypot(last[0] - f.ghost[0], last[1] - f.ghost[1]) < 1e-9, 'from Aim 7 the line runs off the cushion to the ghost ball and stops there');
  assert(f.path.some(p => p[1] < P.R + 1e-3) && f.stub.length === 2, 'by way of the cushion, then the stub');
  assert(f.path.every((p, i) => !i || Math.hypot(p[0] - f.path[i - 1][0], p[1] - f.path[i - 1][1]) < 0.02), 'one unbroken line into the ghost: nothing of the path after the hit');
  ok('a kick shot shows the ring at the cushion, and from Aim 7 the ghost ball and the stub');
}
{ // The guide uses the cue that strikes: with side spin a cue of no squirt meets the ball elsewhere than the default cue.
  const B = [mk(0.5, mid), mk(1.5, mid)], shot = { ang: 0, speed: 2, a: 0.3, b: 0 }, hex = { ...CUE, squirt: 0 };
  const plain = aimGuide(B, shot, 5).ghost, g = aimGuide(B, shot, 5, undefined, hex).ghost, h = predict(B, shot, guideLen(5), hex).hit;
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
      const slop = name === 'dial' ? 44 - DIAL : 0; // the dial is thinner and takes touches beside it
      assert(b.width + slop >= 44 && b.height + slop >= 44, `${name} is a 44 pt target at ${w}x${h}`);
      assert(b.left >= pad.left - 1e-9 && b.top >= pad.top - 1e-9 && b.left + b.width <= w - pad.right + 1e-9 && b.top + b.height <= h - pad.bottom + 1e-9, `${name} is inside the safe area at ${w}x${h}`);
      for (const [other, o] of boxes) assert(name === other || b.left + b.width <= o.left + 1e-9 || o.left + o.width <= b.left + 1e-9 || b.top + b.height <= o.top + 1e-9 || o.top + o.height <= b.top + 1e-9, `${name} and ${other} overlap at ${w}x${h}`);
    }
    assert(v.land === land && ui.rail.left > v.ox + (tw - RAIL) * v.s, 'the rail is right of the table');
  }
  ok('the controls and the table fit the window without overlap');
}
