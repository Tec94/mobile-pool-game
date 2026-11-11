// Run: npm test   (checks the tip and cue elevation control: what a touch sets, and that the engine gets the same shot)
import assert from 'node:assert';
import { CUE, P, predict } from '../physics/engine.ts';
import { grab, LEVEL, moveElev, moveSpin, ringAt, ringTurn, shotTip, spinLabel, tapSpin, zone, zoneLabel } from './tip.ts';
const mk = (x, y) => ({ x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
const near = (a, b, tol, msg) => assert(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b}`);
let n = 0; const ok = name => console.log(`ok ${++n} ${name}`);

{ // The dot stops at the miscue ring with one bump, and lets go of a small offset back to centre ball.
  const out = moveSpin(LEVEL, 0.9, 0.9);
  near(Math.hypot(out.tip.x, out.tip.y), 1, 1e-12, 'held on the ring'); assert(out.bump, 'bump on reaching the ring');
  assert(!moveSpin(out.tip, 2, 2).bump, 'no second bump while it stays on the ring');
  const back = moveSpin({ x: 0.5, y: 0, elev: 30 }, 0.05, 0.05);
  assert(back.tip.x === 0 && back.tip.y === 0 && back.bump && back.tip.elev === 30, 'centre catches, elevation kept');
  assert(!moveSpin(LEVEL, 0.01, 0).bump, 'no bump when it was already centred');
  ok('spin is held inside the miscue ring and catches at centre');
}
{ // A tap places the dot, and lands on a 70% mark when it is near one.
  const t = tapSpin(LEVEL, 0.62, 0.1).tip; assert(t.x === 0.7 && t.y === 0, 'snaps to the right-hand mark');
  const f = tapSpin(LEVEL, 0.4, 0.4).tip; assert(f.x === 0.4 && f.y === 0.4, 'free elsewhere');
  ok('a tap near a 70% mark lands on it');
}
{ // Elevation: whole degrees, 0 to 80, a bump at each zone edge, never a snap.
  assert(moveElev(LEVEL, 200).tip.elev === 80 && moveElev(LEVEL, -5).tip.elev === 0, 'clamped');
  assert(moveElev({ ...LEVEL, elev: 14 }, 15.4).bump && moveElev({ ...LEVEL, elev: 14 }, 15.4).tip.elev === 15, 'bump into the jump zone');
  assert(!moveElev({ ...LEVEL, elev: 20 }, 30).bump, 'no bump inside a zone');
  assert(['Level', 'Jump', 'Hop fades', 'Massé'].join() === [0, 15, 44, 60].map(zone).join(), 'zone edges');
  assert(zoneLabel({ x: 0, y: 0, elev: 65 }).includes('move the dot'), 'masse without side spin says what is missing');
  ok('elevation moves in whole degrees with a bump at each zone edge');
}
{ // The ring reads 0 degrees at 9 o'clock and 80 degrees 120 degrees clockwise from there; the ball inside is the pad.
  const D = 190, c = D / 2, r = 94 / 214 * D, at = deg => { const a = (180 + deg * 1.5) * Math.PI / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  for (const deg of [0, 40, 65, 80]) near(ringAt(...at(deg), D)[0], deg, 1e-9, 'angle under the finger');
  assert(grab(...at(40), D) === 'ring' && grab(c + 10, c - 20, D) === 'pad', 'ring and pad');
  assert(grab(c, c + r, D) === null, 'the lower half of the ring is not a handle');
  near(ringTurn(ringAt(...at(10), D)[0], ringAt(...at(30), D)[0]), 20, 1e-9, 'a drag along the ring');
  near(ringTurn(ringAt(c - r, c + 1, D)[0], ringAt(c - 5, c + r, D)[0]), -58, 3, 'down past 6 o\'clock lowers the cue, it does not jump to 80');
  ok('touches map to the ring and the pad');
}
{ // What the control shows is what the engine plays.
  const s = shotTip({ x: 1, y: -1, elev: 40 });
  near(s.a, CUE.tipLimit, 1e-12, 'full right is the miscue limit'); near(s.b, -CUE.tipLimit, 1e-12, 'full low'); near(s.elev, 40 * Math.PI / 180, 1e-12, 'radians');
  const B = [mk(0.5, P.W / 2), mk(0.75, P.W / 2)], jump = predict(B, { ang: 0, speed: 4.2, ...shotTip({ x: 0, y: 0, elev: 40 }) }, 0.4);
  assert(jump.apex > P.R && jump.lands.length > 0, 'the Jump 40 preset leaves the cloth and lands');
  const masse = predict([mk(0.5, P.W / 2)], { ang: 0, speed: 3.5, ...shotTip({ x: 0.8, y: 0, elev: 65 }) }, 0.4);
  assert(masse.apex < 0.3 * P.R, 'the Massé 65 preset stays down');
  assert(Math.abs(masse.cue[Math.min(masse.cue.length - 1, 200)][1] - P.W / 2) > P.R, 'and curves off the aim line');
  assert(spinLabel(LEVEL) === 'Center ball. No spin' && spinLabel({ x: 0.5, y: -0.5, elev: 0 }) === 'Bottom, draws back with right side · 71%', 'label');
  ok('presets give the engine a jump and a masse');
}
